/**
 * CssWebpPlugin
 * 为 CSS 背景图自动补充 WebP 版本（依赖 HTML/JS 侧注入的 .webp/.no-webp 类）
 */
const path = require('path');
const fs = require('fs');
const glob = require('glob');

class CssWebpPlugin {
  constructor(options = {}) {
    this.options = Object.assign({
      include: /\/img\//,
      exclude: null,
    }, options);
  }

  normalizeUrl(url = '') {
    let s = url.replace(/^['"]|['"]$/g, '');
    if (s.startsWith('data:')) return s;
    s = s.replace(/^[a-zA-Z]+:\/\//, '');
    s = s.replace(/^\/\//, '');
    s = s.replace(/^[^/]+\/(?:static\/.*?\/)?/, '');
    // 修复：优先保留 assets/ 前缀，如果没有则保留 img/ 前缀
    const assetsIdx = s.indexOf('assets/');
    if (assetsIdx !== -1) {
      s = s.substring(assetsIdx);
    } else {
      const idx = s.indexOf('img/');
      if (idx !== -1) s = s.substring(idx);
    }
    s = s.replace(/^\/+/, '').replace(/^\.\/+/, '').replace(/^\.\.\/+/, '');
    return s;
  }

  apply(compiler) {
    compiler.hooks.emit.tapAsync('CssWebpPlugin', (compilation, callback) => {
      const allAssets = Object.keys(compilation.assets);
      const cssAssets = allAssets.filter(name => /\.css(\?|$)/i.test(name));
      const publicPath = compilation.outputOptions.publicPath || '';

      cssAssets.forEach(cssFile => {
        const asset = compilation.assets[cssFile];
        let source = asset.source();
        const ruleRegex = /([^{}]+)\s*\{([^{}]*background[^{}]*)\}/gi;
        const processedRules = new Map();
        let match;

        while ((match = ruleRegex.exec(source)) !== null) {
          const selector = match[1].trim();
          const properties = match[2];
          const urlMatches = properties.match(/url\(['"]?([^'")\s]+)['"]?\)/gi);

          if (!urlMatches || urlMatches.length === 0) {
            continue;
          }

          let hasProcessableImages = false;
          const webpUrls = [];

          urlMatches.forEach(urlMatch => {
            const urlMatchResult = urlMatch.match(/url\(['"]?([^'")\s]+)['"]?\)/i);
            if (!urlMatchResult) return;
            const url = urlMatchResult[1];

            const isImage = /\.(png|jpe?g)(\?|$)/i.test(url);
            const shouldProcess = this.shouldProcess(url);

            if (shouldProcess && isImage) {
              hasProcessableImages = true;
              const webpUrl = url.replace(/\.(png|jpe?g)(\?[^"']*)?$/i, '.webp$2');
              webpUrls.push(webpUrl);
            }
          });

          if (hasProcessableImages && !processedRules.has(selector)) {
            processedRules.set(selector, {
              selector,
              webpUrls
            });
          }
        }

        let supportsRules = '';

        processedRules.forEach((ruleData) => {
          if (ruleData.webpUrls.length > 0) {
            const webpProperties = ruleData.webpUrls
              .map(webpUrl => `    background-image: url(${webpUrl})`)
              .join(';\n');

            supportsRules += `\n/* WebP support */\n.webp ${ruleData.selector} {\n${webpProperties};\n}\n`;
          }
        });

        if (supportsRules) {
          source += supportsRules;
          compilation.assets[cssFile] = {
            source: () => source,
            size: () => source.length
          };
        }
      });

      callback();
    });

    compiler.hooks.done.tapPromise('CssWebpPlugin-Cleanup', async (stats) => {
      const outputPath = stats.compilation.outputOptions.path;
      if (!outputPath) {
        return;
      }

      const cssFiles = glob.sync(path.join(outputPath, '**/*.css'));
      let cleanedCount = 0;

      cssFiles.forEach(cssFile => {
        let css = fs.readFileSync(cssFile, 'utf8');
        let modified = false;

        css = css.replace(/\/\*\s*WebP\s+support\s*\*\/\s*\.webp\s+([^{]+)\s*\{([^}]+)\}/gi,
          (match, selector, properties) => {
            const webpUrls = properties.match(/url\(([^)]+\.webp[^)]*)\)/gi) || [];
            let allExist = true;

            webpUrls.forEach(urlMatch => {
              let url = urlMatch.match(/url\(([^)]+)\)/)[1];
              url = url.replace(/^['"]|['"]$/g, '');
              const filePath = this.normalizeUrl(url).split('?')[0];
              const webpPath = path.join(outputPath, filePath);

              if (!fs.existsSync(webpPath)) {
                allExist = false;
              }
            });

            if (!allExist) {
              modified = true;
              cleanedCount++;
              return '';
            }

            return match;
          });

        if (modified) {
          fs.writeFileSync(cssFile, css, 'utf8');
        }
      });

      if (cleanedCount > 0) {
        console.log(`CssWebpPlugin: 清理了 ${cleanedCount} 个无效的 WebP 规则`);
      }
    });
  }

  shouldProcess(url) {
    const normalizedUrl = this.normalizeUrl(url);

    if (this.options.include) {
      const matches = this.options.include.test(url) || this.options.include.test(normalizedUrl);
      if (!matches) {
        return false;
      }
    }

    if (this.options.exclude && this.options.exclude.test(url)) {
      return false;
    }

    return true;
  }
}

module.exports = CssWebpPlugin;

