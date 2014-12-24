#!/usr/bin/env node
/* vim: set expandtab sw=2 ts=2 : */

var io = require('socket.io-client');
var ChartRoom = require('./ChartRoom.js');


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
    console.log('Disconnect');
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
  console.log('Override ChartRoomTalker onMessage method');
  process.exit(1);
};


ChartRoomTalker.prototype.onError = function(error) {
  console.log('Override ChartRoomTalker onError method');
  process.exit(1);
};
