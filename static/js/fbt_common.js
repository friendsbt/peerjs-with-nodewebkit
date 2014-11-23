// DOM

// io is defined in socket.io.js
window.socket = io.connect('http://localhost/', { port: 12345 });

window.socket.on('connect_downloader', function(data){
  PeerWrapper.upload(data.my_uid, data.downloader_uid, data.fileInfo);
});

window.socket.on('send_block', function(dataNode2DOM){
  PeerWrapper.sendBlock(dataNode2DOM);
});

window.socket.on("initpeer", function(my_uid){
  PeerWrapper.initPeer(my_uid);
});

window.socket.on('control', function(message){
  switch(message.type) {
    case "disconnect":
      connections[DOWNLOADER][0].close();
      peer.disconnect();
      break;
    case "result":
      console.log(message.result);
      peer.disconnect();
      break;
    default:
      console.log("wrong ctrl msg: ", message);
  }
});
