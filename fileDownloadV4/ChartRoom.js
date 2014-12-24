/* vim: set expandtab sw=2 ts=2 : */

var SocketPool = require('./SocketPool.js');


var ChartRoom = module.exports = function(io) {
  this.io = io;
  this.socketPool = new SocketPool();
};


ChartRoom.JOIN = 'JOIN'; // clients join chartroom
ChartRoom.SEND = 'SEND'; // client sends message to server
ChartRoom.RECV = function(uid) {
  return 'RECV' + uid;
}; // server turns message to specified client
ChartRoom.NOTE = function(uid) {
  return 'NOTE' + uid; // server sends message to specified client
};


ChartRoom.prototype.onJoin= function(socket) {
  var that = this;

  socket.on(ChartRoom.JOIN, function (uid) {
    that.socketPool.add(uid, socket);
    global.window.console.log('uid:' + uid + ' logined. socket:' + socket.id);
  });
};


ChartRoom.prototype.onMessage = function(socket) {
  var that = this;

  socket.on(ChartRoom.SEND, function (talk) {
    var dSocket = that.socketPool.get(talk.dUid);
    if(dSocket) {
      dSocket.emit(ChartRoom.RECV(talk.dUid), talk);
      global.window.console.log('talk sent');
    }
    else {
      var note = 'talk not sent';
      global.window.console.log(note);
      socket.emit(ChartRoom.NOTE(talk.sUid), note);
    }
  });
};


ChartRoom.prototype.onBye = function(socket) {
  var that = this;

  socket.on('disconnect', function() {
    that.socketPool.removeBySocket(socket);
  });
};


ChartRoom.prototype.start = function() {
  this.socketPool = new SocketPool();

  var that = this;
  this.io.sockets.on('connection', function (socket) {

    that.onJoin(socket);

    that.onMessage(socket);

    that.onBye(socket);
  });
};
