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

  normalizeUrl(url = '', publicPath = '') {
    let s = url.replace(/^['"]|['"]$/g, '');
    if (s.startsWith('data:')) return s;
    
    // 移除协议
    s = s.replace(/^[a-zA-Z]+:\/\//, '');
    // 移除双斜杠
    s = s.replace(/^\/\//, '');
    
    // 移除域名和可能的 CDN 路径前缀
    // 匹配: domain.com/path/ 或 domain.com/static/path/
    s = s.replace(/^[^/]+\/(?:static\/[^/]+\/)?/, '');
    
    // 移除 publicPath 前缀（如果存在且匹配）
    if (publicPath) {
      // 标准化 publicPath：移除协议和域名
      let normalizedPublicPath = publicPath.replace(/^[a-zA-Z]+:\/\//, '').replace(/^\/\//, '');
      normalizedPublicPath = normalizedPublicPath.replace(/^[^/]+\/(?:static\/[^/]+\/)?/, '');
      normalizedPublicPath = normalizedPublicPath.replace(/^\/+/, '');
      
      if (normalizedPublicPath && s.startsWith(normalizedPublicPath)) {
        s = s.substring(normalizedPublicPath.length);
      }
    }
    
    // 处理相对路径和多余的斜杠
    s = s.replace(/^\/+/, '').replace(/^\.\/+/, '').replace(/^\.\.\/+/, '');
    
    // 返回完整的相对路径（不依赖特定的目录名）
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
              // 使用 publicPath 来标准化 URL
              const publicPath = stats.compilation.outputOptions.publicPath || '';
              const filePath = this.normalizeUrl(url, publicPath).split('?')[0];
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
