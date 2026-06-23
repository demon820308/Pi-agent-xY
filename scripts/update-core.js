const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🔍 正在从 npm registry 获取 @earendil-works/pi-coding-agent 的最新版本');
  try {
    const latestVersion = execSync('npm view @earendil-works/pi-coding-agent version', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    if (!latestVersion) {
      throw new Error('未获取到有效的版本号。');
    }
    console.log(`✨ 最新版本为: ${latestVersion}`);

    const pkgPath = path.join(__dirname, '..', 'package.json');
    if (!fs.existsSync(pkgPath)) {
      throw new Error(`未找到 package.json 文件: ${pkgPath}`);
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const targetVersion = `^${latestVersion}`;

    if (pkg.dependencies['@earendil-works/pi-ai'] === targetVersion && 
        pkg.dependencies['@earendil-works/pi-coding-agent'] === targetVersion) {
      console.log(`ℹ️ 已经是最新版本 (${latestVersion})，无需更新！`);
      return;
    }

    console.log(`🔄 正在更新 package.json 依赖到 ^${latestVersion}`);
    pkg.dependencies['@earendil-works/pi-ai'] = targetVersion;
    pkg.dependencies['@earendil-works/pi-coding-agent'] = targetVersion;

    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    console.log('✅ package.json 更新成功。');

    console.log('📦 正在运行 "npm install" 安装新版核心依赖');
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ 依赖安装完成。');

    console.log('🛡️ 正在进行 TypeScript 编译安全检查');
    try {
      execSync('node_modules\\.bin\\tsc --noEmit', { stdio: 'inherit' });
      console.log('🎉 一键更新成功！所有类型检查均正常通过！');
    } catch (err) {
      console.error('⚠️ TypeScript 检查发现了类型问题，请查看上方编译报错。');
    }
  } catch (error) {
    console.error('❌ 一键升级失败:', error.message || error);
    process.exit(1);
  }
}

main();
