// Dot.exe 의 껍데기. 실제 프로그램은 .devlog/dashboard 에서 불러온다.
// 그래서 화면·기능을 고쳐도 exe 를 다시 만들 필요가 없다. (위치를 옮겼으면 환경변수 DOT_HOME 으로 지정)
const path = require('path');
const fs = require('fs');
const { app, dialog } = require('electron');

const home = process.env.DOT_HOME || path.resolve(__dirname, '..');
const main = path.join(home, 'main.js');

if (fs.existsSync(main)) {
  require(main);
} else {
  app.whenReady().then(() => {
    dialog.showErrorBox('Dot', `프로그램 폴더를 찾지 못했습니다:\n${home}\n\n환경변수 DOT_HOME 으로 dashboard 폴더를 지정하세요.`);
    app.quit();
  });
}
