const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_URL = 'https://github.com/demon820308/ppt-master.git';
const TARGET_DIR = path.join(__dirname, '..', 'ppt-master-main');

function runCmd(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {
    console.error(`❌ Failed to run command: ${cmd}`);
    throw e;
  }
}

function main() {
  console.log(`🔍 正在检查目标目录: ${TARGET_DIR}`);

  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  const gitDir = path.join(TARGET_DIR, '.git');
  
  if (!fs.existsSync(gitDir)) {
    console.log('📦 正在从 GitHub 初始化 ppt-master 的稀疏检出仓库');
    // Clean target directory first to make sure there are no conflicts
    fs.readdirSync(TARGET_DIR).forEach((file) => {
      const curPath = path.join(TARGET_DIR, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        fs.rmSync(curPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(curPath);
      }
    });

    runCmd('git init', TARGET_DIR);
    runCmd(`git remote add origin ${REPO_URL}`, TARGET_DIR);
    runCmd('git config core.sparseCheckout true', TARGET_DIR);
    
    // Configure sparse checkout to only retrieve skills/ppt-master
    const sparsePath = path.join(gitDir, 'info', 'sparse-checkout');
    if (!fs.existsSync(path.dirname(sparsePath))) {
      fs.mkdirSync(path.dirname(sparsePath), { recursive: true });
    }
    fs.writeFileSync(sparsePath, 'skills/ppt-master\n', 'utf-8');
    
    console.log('🚚 正在从 GitHub 下载核心文件');
    runCmd('git pull origin main', TARGET_DIR);
    
    try {
      const localHead = runCmd('git rev-parse HEAD', TARGET_DIR);
      const localVersion = localHead.substring(0, 7);
      console.log(`🎉 首次初始化完成！当前版本为: ${localVersion}`);
    } catch (e) {
      console.log('🎉 首次初始化完成！');
    }
  } else {
    // 🔍 版本一致性对比检测
    try {
      console.log('🔍 正在从 GitHub 获取 ppt-master 的最新版本');
      const remoteHeadLine = runCmd(`git ls-remote ${REPO_URL} refs/heads/main`, TARGET_DIR);
      const remoteHead = remoteHeadLine.split(/\s+/)[0];
      const remoteVersion = remoteHead.substring(0, 7);
      
      const localHead = runCmd('git rev-parse HEAD', TARGET_DIR);
      const localVersion = localHead.substring(0, 7);
      
      console.log(`✨ 最新版本为: ${remoteVersion}`);
      
      if (localHead === remoteHead) {
        console.log(`ℹ️ 已经是最新版本 (${localVersion})，无需更新！`);
        return;
      }
      
      console.log(`🔄 正在将 ppt-master 从 ${localVersion} 更新到最新版本 ${remoteVersion}`);
      runCmd('git fetch origin', TARGET_DIR);
      runCmd('git reset --hard origin/main', TARGET_DIR);
      console.log('🎉 一键更新成功！已升级到最新版本。');
    } catch (err) {
      console.warn('⚠️ 版本检查失败，将直接执行强制更新', err.message);
      runCmd('git fetch origin', TARGET_DIR);
      runCmd('git reset --hard origin/main', TARGET_DIR);
      console.log('🎉 强制更新完成。');
    }
  }
}

main();
