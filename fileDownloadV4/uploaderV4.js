// NODE
var fs = require('fs');
var raf = require('random-access-file');
var settings = require('settings');
var utils = require('utils');
var BLOCK_SIZE = settings.BLOCK_SIZE;

var browserWindow;
exports.initWindow = function(window) {
  browserWindow = window;
};

exports.initV4Upload = function(my_uid, downloader_uid, hash, filesize){
  var totalFullBlocks = parseInt((filesize - BLOCK_SIZE + 1) / BLOCK_SIZE);
  var realLastBlockSize = filesize - BLOCK_SIZE * totalFullBlocks;
  browserWindow.console.log('totalblock:' + totalFullBlocks.toString());
  browserWindow.console.log('lastblocksize:' + realLastBlockSize.toString());
  var path = 'Advice.mp3';  // TODO: retrieve from db
  global.socket.emit('connect_downloader', {
    'my_uid': my_uid,
    'downloader_uid': downloader_uid,
    'fileInfo': {
      'totalFullBlocks': totalFullBlocks,
      'realLastBlockSize': realLastBlockSize,
      'size': hash,
      'path': path
    }
  });
};

global.socket.on('send_data_blocks', function(msg) {
  /*
  last_block_size = BLOCK_SIZE, unless the last block of file will be sent here
  msg {path, start, end, lastBlockSize, downloader, hash}
   */
  var file = raf(msg.path);
  var index = msg.start;
  var dataNode2DOM;
  var intervalObj = setInterval(function() {
    if (index >= msg.end) {
      clearInterval(intervalObj);
      file.read(msg.start, msg.lastBlockSize, function(err, data) {
        dataNode2DOM = {
          content: utils.toArrayBuffer(data),
          hash: msg.hash,
          index: index,
          downloader: msg.downloader
        };
        global.socket.emit('send_block', dataNode2DOM);
        browserWindow.console.log("last block sent");
        file.close();
        // 上传端不断开连接, 下载端确认hash之后断开所有连接
      });
    } else {
      file.read(start, BLOCK_SIZE, function(err, data) {
        dataNode2DOM = {
          content: utils.toArrayBuffer(data),
          hash: msg.hash,
          index: index,
          downloader: msg.downloader
        };
        global.socket.emit('send_block', dataNode2DOM);
        msg.start += BLOCK_SIZE;
        index++;
      });
    }
  }, 1000);
});

/* TODO: 之后要把upload_main里的逻辑移入initV4Upload
function upload_main(my_uid, downloader_uid, hash, size){
    global.log.info(my_uid);
    global.log.info(downloader_uid);
    global.log.info(hash);

    if (typeof(global.upload_clients) === "undefined") {
        global.upload_clients = {}; // 初始化, 记录client, 因为要用到client.is_available属性
    }

    utils.get_sourcefile_from_hash(global.res_hash_collection, hash, parseInt(size), main);

    function main(path, size) {
        fs.appendFileSync(mylog, 'sizetype: ' + typeof(size) + '\n');
        var totalparts = parseInt((size+partsize-1)/partsize);
        var totalblocks = parseInt((size+BLOCK_SIZE-1)/BLOCK_SIZE);

        var pool = 'u:' + my_uid.toString() + ':' + hash.toString() + ':' + downloader_uid.toString();
        fs.appendFileSync(mylog, "pool: " + pool);
        var client_id = pool + '-' + Date.now(); // 用pool+timestamp表示上传端的client,保证唯一性

        var interval_obj = setInterval(function () {
            if (global.upload_clients[client_id]) { // 有可能还是undefined, 所以要等到client存在
                if (global.upload_clients[client_id].is_available) {
                    clearInterval(interval_obj);
                    var socket = global.upload_clients[client_id].socket;
                    socket.removeAllListeners("message");
                    addEventListener(socket, path, totalparts, totalblocks, parseInt(size), client_id);
                    fs.appendFileSync(mylog, "uploader listening on " + socket.address().port+'\n');
                    fs.appendFileSync(mylog, "prepare to upload\n");
                }
            }
        }, 100); // 500ms is too long

        create_upload_client(global.nat_type, pool, client_id, interval_obj);
    }
}
*/