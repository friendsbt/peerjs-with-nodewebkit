var fs = require('fs');
var path = require('path');
var buffertools = require('buffertools');
var utils = require('./fileDownloadV4/utils');
var crc32 = require('crc-32');

var f1 = fs.openSync(path.join(__dirname, 'Advice.mp3'), 'r');
var f2 = fs.openSync(path.join(__dirname, 'Advice1.mp3'), 'r');
var bf1 = Buffer(1024);
var bf2 = Buffer(1024);

for (var i = 0; i < 10895; i++) {
  fs.readSync(f1, bf1, 0, 1024, i*1024);
  fs.readSync(f2, bf2, 0, 1024, i*1024);
  if (!buffertools.equals(bf1, bf2)) {
    console.log(i);
    console.log("bf1: ", crc32.buf(bf1), "bf2: ", crc32.buf(bf2));
  }
}

