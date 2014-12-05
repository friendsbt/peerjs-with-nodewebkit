// io is defined in socket.io.js
window.socket = io.connect('http://localhost/', { port: 12345 });

window.socket.on("initpeer", function(my_uid){
  PeerWrapper.initPeer(my_uid);
});

window.socket.on('connect_downloader', function(data){
  PeerWrapper.upload(data.my_uid, data.downloader_uid, data.fileInfo, 0);
});

window.socket.on('send_block', function(dataNode2DOM){
  PeerWrapper.sendBlock(dataNode2DOM);
});

window.socket.on('download', function(downloadFileInfo){
  console.log("downloadFileInfo: ", JSON.stringify(downloadFileInfo));
  PeerWrapper.download(downloadFileInfo.hash, downloadFileInfo.totalparts);
});

window.socket.on('downloadBlock', function(redownloadMessage){
  console.log("fbt_common, redownload block: ", redownloadMessage.index);
  PeerWrapper.downloadBlock(redownloadMessage);
});

window.socket.on('complete', function(hash){
  PeerWrapper.clear(hash);
});

/* 移植到FBT时才能够使用
function updateProgressBarMessage(hash, msg) {
  var FLAG = ['m', 'p', 'f'];
  var id;
  FLAG.some(function(flag){
    id = hash + flag;
    if ($("#container_download_resources").children("#item"+id).length > 0) {
      $('#download_progress' + id).html(msg);
      return true;
    }
  });
}
*/

