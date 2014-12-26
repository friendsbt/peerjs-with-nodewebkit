/* vim: set expandtab sw=2 ts=2 : */

var io = require('socket.io-client');

/*
 * ChartRoom settings
 */
var ChartRoom = {};
ChartRoom.JOIN = 'JOIN'; // clients join chartroom
ChartRoom.SEND = 'SEND'; // client sends message to server
ChartRoom.RECV = function(uid) {
  return 'RECV' + uid;
}; // server turns message to specified client
ChartRoom.NOTE = function(uid) {
  return 'NOTE' + uid; // server sends message to specified client
};

/*
 * ChartRoomTalker defination
 */
var ChartRoomTalker = module.exports = function(crAddress, uid) {
  this.crAddress = crAddress;
  this.uid = uid;
  this.socket = io.connect(crAddress);
  this.socket.emit(ChartRoom.JOIN, this.uid);

  var that = this;
  this.socket.on(ChartRoom.RECV(uid), function(talk) {
    that.onMessage(talk.sUid, talk.message);
  });
  this.socket.on(ChartRoom.NOTE(uid), function(note) {
    var error = note;
    that.onError(error);
  });

  this.socket.on('disconnect', function() {
    global.window.console.log('Disconnect');
  });
};


ChartRoomTalker.prototype.send = function(dUid, message) {
  var talk = {
    sUid: this.uid,
    dUid: dUid,
    message: message
  };
  this.socket.emit(ChartRoom.SEND, talk);
};


ChartRoomTalker.prototype.onMessage = function(sUid, message) {
  global.window.console.log('Override ChartRoomTalker onMessage method');
  process.exit(1);
};


ChartRoomTalker.prototype.onError = function(error) {
  global.window.console.log('Override ChartRoomTalker onError method');
  process.exit(1);
};
