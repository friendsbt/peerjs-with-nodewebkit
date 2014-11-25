exports.peerjsDownloader = function(hash) {
  this.hash = hash;
};

peerjsDownloader.prototype.startFileDownload = function(){
  global.socket.emit('download', this.hash);
};
