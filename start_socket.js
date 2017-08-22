const express = require('express');
const logger = require('morgan');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
var app = express();
var server = require('http').Server(app)
var io = require('socket.io')(server)
var path = require('path');
var fs = require('fs');
var FILES_DIR = __dirname + "/public/file";
var PREVIEW_DIR = __dirname + "/public/file/screenshots";
var config = require('./config');
var async = require('async');
var fs = require('fs');

var series = {};
var serverAddr = config.serverAddress;
var spawn = require('child_process').spawn;

const port = parseInt(process.env.PORT, 10) || config.apiPort;
app.set('port', port);

const MongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;

var db;

MongoClient.connect(config.databaseURL, (err, database) => {
  // ... start the server
  if (err) return console.log(err)
  db = database
  server.listen(port)
})


app.use(logger('dev'));
app.use(bodyParser.json());
app.use(fileUpload());
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/api', (req, res) => res.status(200).send({
  message: 'Welcome to the API!',
}));

app.post('/api/user/signup', (req, res) => {

  if (!req.files || !req.files.profile_photo) {
    return res.status(400).send({
      err: 'failed',
      message: 'No files were uploaded.'
    });
  }
  // if (!req.body.user_name && !req.body.phone_number) {
  //   return res.status(400).send({
  //     err: 'failed',
  //     message: 'Username or Phonenumber must be provided'
  //   });
  // }
  if (!req.body.user_name || /*!req.body.phone_number ||*/ !req.body.display_name) {
    return res.status(400).send({
      err: 'failed',
      message: 'Insufficient input values. Some args are missing'
    });
  }
  var rec = db.collection('users').findOne({ user_name: req.body.user_name}).then((doc) => {
    if(doc) {
      return res.status(400).send({
        err: 'failed',
        message: 'Username already exists'
      });
    }
    var profile_photo = req.files.profile_photo;
    var filename = new Date().getTime()+'.png';
    profile_photo.mv('public/avatars/' + filename, function(err) {
      if (err) {
        return res.status(500).send({
          err: 'failed',
          message: err
        });
      }
      db.collection('users').save({
        profile_photo: 'avatars/' + filename,
        display_name: req.body.display_name,
        user_name: req.body.user_name,
        website: req.body.website || '',
        bio: req.body.bio || '',
        phone_number: req.body.phone_number,
        followers: [], //[ "user1", "user2" ],
        followings: [], //[ "user3", "user4", "user5", "user6", "user7" ],
        videos: []
      }, (err, result) => {
        var doc = result.ops[0];
        doc.profile_photo = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.profile_photo;
        res.status(200).send({
          err: null,
          message: 'Success',
          user: Object.assign({ 'follower_count': doc.followers.length, 'following_count': doc.followings.length, 'video_count': doc.videos.length }, doc)
        })
      });
    });
  });
});

app.post('/api/user/update/:user_id', (req, res) => {
  async.waterfall([
      function(callback) {
        try {
          var objId = ObjectID(req.params.user_id);
        } catch(e) {
          callback({
            err: 'failed',
            message: 'Invalid user_id'
          })
        }
        if (!req.files || !req.files.profile_photo) {
          return callback(null, '');
        }
        var profile_photo = req.files.profile_photo;
        var filename = new Date().getTime()+'.png';
        profile_photo.mv('public/avatars/' + filename, function(err) {
          if (err) {
            return callback({
              err: 'failed',
              message: err
            });
          }
          return callback(null, 'avatars/'+filename);
        });
      },
      function(profile_photo, callback) {
        var setObj = {};
        setObj['profile_photo'] = profile_photo || '';
        setObj['display_name'] = req.body.display_name || '';
        setObj['website'] = req.body.website || '';
        setObj['bio'] = req.body.bio || '';
        setObj['phone_number'] = req.body.phone_number || '';

        return db.collection('users').findOneAndUpdate(
          {
            _id: ObjectID(req.params.user_id)
          },
          {
            $set: setObj
          },
          {
            //returnNewDocument: true
            returnOriginal: false
          }
        ).then((ret) => {
          var doc = ret.value;
          doc.profile_photo = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.profile_photo;
          res.status(200).send({
            err: null,
            message: 'Successfully updated',
            user: doc
          });
        });
      }
    ],
    function(err, result) {
      if(err) {
        res.status(400).send(err);
      }
      res.status(200).send({
        err: null,
        message: 'Success',
        user: doc
      });
    });
});

app.get('/api/user/get/:user_id', (req, res) => {
  if (!req.params.user_id) {
    return res.status(400).send({
      err: 'failed',
      message: 'Insufficient input values. Some args are missing'
    });
  }
  db.collection('users').findOne({ _id: ObjectID(req.params.user_id) }).then((doc) => {
    if(!doc) {
      return res.status(400).send({
        err: 'failed',
        message: 'No user found'
      });
    }
    doc.profile_photo = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.profile_photo;
    return res.status(200).send({
      err: null,
      message: "Success",
      user: Object.assign({ 'follower_count': doc.followers.length, 'following_count': doc.followings.length, 'video_count': doc.videos.length }, doc)
    });
  })
})

app.post('/api/user/login', (req, res) => {
  if (!req.body.phone_number) {
    return res.status(400).send({
      err: 'failed',
      message: 'Insufficient input values. Some args are missing'
    });
  }
  db.collection('users').findOne({ phone_number: req.body.phone_number }).then((doc) => {
    if(!doc) {
      return res.status(400).send({
        err: 'failed',
        message: 'No user found'
      });
    }
    doc.profile_photo = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.profile_photo;
    return res.status(200).send({
      err: null,
      message: "Success",
      user: Object.assign({ 'follower_count': doc.followers.length, 'following_count': doc.followings.length, 'video_count': doc.videos.length }, doc)
    });
  })
});
app.post('/api/user/fb_login', (req, res) => {
  if (!req.body.user_name) {
    return res.status(400).send({
      err: 'failed',
      message: 'Insufficient input values. Some args are missing'
    });
  }
  db.collection('users').findOne({ user_name: req.body.user_name }).then((doc) => {
    if(!doc) {
      return res.status(400).send({
        err: 'failed',
        message: 'No user found'
      });
    }
    doc.profile_photo = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.profile_photo;
    return res.status(200).send({
      err: null,
      message: "Success",
      user: Object.assign({ 'follower_count': doc.followers.length, 'following_count': doc.followings.length, 'video_count': doc.videos.length }, doc)
    });
  })
});

app.get('/api/user/:user_id/others/:search_key?', (req, res) => {
  async.waterfall(
    [
      function(callback) {
        db.collection('users').findOne({ _id: ObjectID(req.params.user_id) }).then((doc) => {
          if(!doc) {
            callback('Invalid user id');
          }
          callback(null, doc)
        });
      },
      function(user, callback) {
        let searchParams = {
          _id: {
            $nin: [ user._id ]
          }
        };
        if(req.params.search_key) {
          searchParams['$or'] = [{
              user_name: { $regex: new RegExp('.*' + req.params.search_key + '.*', 'i') }
          },{
              display_name: { $regex: new RegExp('.*' + req.params.search_key + '.*', 'i') }
          },{
              phone_number: { $regex: new RegExp('.*' + req.params.search_key + '.*', 'i') }
          }];
        }
        db.collection('users').find(searchParams).toArray((err, docs) => {
          if(err) {
            callback('Error occured while getting user list');
          }
          docs = docs.map((doc) => {
            doc.is_following = user.followings.indexOf(doc._id.toString())>-1?true:false;
            doc.profile_photo = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.profile_photo;
            return doc;
          })
          callback(null, docs);
        })
      }
    ],
    function(err, result) {
      if(err) {
        res.status(400).send({
          err: 'failed',
          message: err //'Something went wrong'
        });
      }

      res.status(200).send({
        err: null,
        message: "Success",
        users: result
      })
    }
  );
});

app.get('/api/user/:user_id/followings/:search_key?', (req, res) => {
  async.waterfall(
    [
      function(callback) {
        db.collection('users').findOne({ _id: ObjectID(req.params.user_id) }).then((doc) => {
          if(!doc) {
            callback('Invalid user id');
          }
          callback(null, doc)
        });
      },
      function(user, callback) {
        if(user.followings.length==0) callback(null, []);
        var followings = [];
        var myPromise = new Promise((resolve, reject) => {
          user.followings.map((following) => {
            db.collection('users').findOne({ _id: ObjectID(following) }).then((doc) => {
              if(!doc) {
                callback('Invalid user id');
              }
              doc.profile_photo = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.profile_photo;
              followings.push(doc);
              if(followings.length == user.followings.length) {
                resolve(followings);
              }
            });
          });
        })
        myPromise.then((ret) => {
          callback(null, ret.filter((doc) => {
            if(!req.params.search_key) return true;
            let searchKey = req.params.search_key;
            if(doc.user_name.indexOf(searchKey)>-1 || doc.display_name.indexOf(searchKey)>-1 || doc.phone_number.indexOf(searchKey)>-1) {
              return true;
            }
            return false;
          }));
        })
      }
    ],
    function(err, result) {
      if(err) {
        res.status(400).send({
          err: 'failed',
          message: err //'Something went wrong'
        });
      }

      res.status(200).send({
        err: null,
        message: "Success",
        users: result
      })
    }
  );
});
app.get('/api/user/:user_id/followers/:search_key?', (req, res) => {
  async.waterfall(
    [
      function(callback) {
        db.collection('users').findOne({ _id: ObjectID(req.params.user_id) }).then((doc) => {
          if(!doc) {
            callback('Invalid user id');
          }
          callback(null, doc)
        });
      },
      function(user, callback) {
        if(user.followers.length==0) callback(null, []);
        var followers = [];
        var myPromise = new Promise((resolve, reject) => {
          user.followers.map((follower) => {
            db.collection('users').findOne({ _id: ObjectID(follower) }).then((doc) => {
              if(!doc) {
                callback('Invalid user id');
              }
              doc.profile_photo = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.profile_photo;
              followers.push(doc);
              if(followers.length == user.followers.length) {
                resolve(followers);
              }
            });
          });
        })
        myPromise.then((ret) => {
          callback(null, ret.filter((doc) => {
            if(!req.params.search_key) return true;
            let searchKey = req.params.search_key;
            if(doc.user_name.indexOf(searchKey)>-1 || doc.display_name.indexOf(searchKey)>-1 || doc.phone_number.indexOf(searchKey)>-1) {
              return true;
            }
            return false;
          }));
        })
      }
    ],
    function(err, result) {
      if(err) {
        res.status(400).send({
          err: 'failed',
          message: err //'Something went wrong'
        });
      }

      res.status(200).send({
        err: null,
        message: "Success",
        users: result
      })
    }
  );
});
app.post('/api/follow/:source_id/:target_id', (req, res) => {
  async.waterfall(
    [
      function(callback) {
        if(req.params.source_id == req.params.target_id) {
          callback('Cannot follow self');
        }
        callback(null);
      },
      function(callback) {
        db.collection('users').findOne({ _id: ObjectID(req.params.source_id) }).then((doc) => {
          if(!doc) {
            callback('Invalid user id');
          }
          callback(null, doc)
        });
      },
      function(source, callback) {
        db.collection('users').findOne({ _id: ObjectID(req.params.target_id) }).then((doc) => {
          if(!doc) {
            callback('Invalid user id');
          }
          callback(null, source, doc)
        });
      },
      function(source, target, callback) {
        db.collection('users').findOneAndUpdate({ _id: ObjectID(source._id)}, {$addToSet: { followings: target._id.toString() }}).then((ret) => {
          callback(null, source, target);
        });
      },
      function(source, target, callback) {
        db.collection('users').findOneAndUpdate({ _id: ObjectID(target._id)}, {$addToSet: { followers: source._id.toString() }}).then((ret) => {
          callback(null, '');
        });
      }
    ],
    function(err, result) {
      if(err) {
        res.status(400).send({
          err: 'failed',
          message: err //'Something went wrong'
        });
      }

      res.status(200).send({
        err: null,
        message: "Success",
        //users: result
      })
    }
  );
});
app.post('/api/unfollow/:source_id/:target_id', (req, res) => {
  async.waterfall(
    [
      function(callback) {
        if(req.params.source_id == req.params.target_id) {
          callback('Cannot follow self');
        }
        callback(null);
      },
      function(callback) {
        db.collection('users').findOne({ _id: ObjectID(req.params.source_id) }).then((doc) => {
          if(!doc) {
            callback('Invalid user id');
          }
          callback(null, doc)
        });
      },
      function(source, callback) {
        db.collection('users').findOne({ _id: ObjectID(req.params.target_id) }).then((doc) => {
          if(!doc) {
            callback('Invalid user id');
          }
          callback(null, source, doc)
        });
      },
      function(source, target, callback) {
        db.collection('users').findOneAndUpdate({ _id: ObjectID(source._id)}, {$pull: { followings: target._id.toString() }}).then((ret) => {
          callback(null, source, target);
        });
      },
      function(source, target, callback) {
        db.collection('users').findOneAndUpdate({ _id: ObjectID(target._id)}, {$pull: { followers: source._id.toString() }}).then((ret) => {
          callback(null, '');
        });
      }
    ],
    function(err, result) {
      if(err) {
        res.status(400).send({
          err: 'failed',
          message: err //'Something went wrong'
        });
      }

      res.status(200).send({
        err: null,
        message: "Success",
        //users: result
      })
    }
  );
});

app.get('/rooms', function(req, res) {
  if(req.params.key) { 
    db.collection('streams').find({ title: { $regex: new RegExp(".*" + req.params.key + ".*", "i") } }).toArray((err, docs) => {
      if(err) {
        return res.status(400).send({
          err: 'failed',
          message: 'Error occured while getting live stream list'
        });
      }
      docs = docs.map((doc) => {
        doc.thumb_url = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.thumb_url;
        doc.stream_url = 'rtmp://' + config.serverAddress + '/' + doc.stream_url;
        return doc;
      });
      return res.status(200).send(docs);
    });
  } else {
    db.collection('streams').find({ islive: true }).toArray((err, docs) => {
      if(err) {
        return res.status(400).send({
          err: 'failed',
          message: 'Error occured while getting live stream list'
        });
      }
      docs = docs.map((doc) => {
        doc.thumb_url = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.thumb_url;
        doc.stream_url = 'rtmp://' + config.serverAddress + '/' + doc.stream_url;
        return doc;
      });
      return res.status(200).send(docs);
    });
  }
});

app.get('/api/streams/:key?', function(req, res) {
//app.get('/rooms', function(req, res) {
  if(req.params.key) { 
    db.collection('streams').find({ title: { $regex: new RegExp(".*" + req.params.key + ".*", "i") } }).toArray((err, docs) => {
      if(err) {
        return res.status(400).send({
          err: 'failed',
          message: 'Error occured while getting live stream list'
        });
      }
      docs = docs.map((doc) => {
        doc.thumb_url = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.thumb_url;
        doc.stream_url = 'rtmp://' + config.serverAddress + '/' + doc.stream_url;
        return doc;
      });
      return res.status(200).send(docs);
    });
  } else {
    db.collection('streams').find({ islive: true }).toArray((err, docs) => {
      if(err) {
        return res.status(400).send({
          err: 'failed',
          message: 'Error occured while getting live stream list'
        });
      }
      docs = docs.map((doc) => {
        doc.thumb_url = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.thumb_url;
        doc.stream_url = 'rtmp://' + config.serverAddress + '/' + doc.stream_url;
        return doc;
      });
      return res.status(200).send(docs);
    });
  }
})

app.post('/api/viewed/:video_id', function(req, res) {
  db.collection('streams').findOneAndUpdate({
    _id: ObjectID(req.params.video_id),
    //islive: false
  }, {
    $inc: {
      views: 1
    }
  }).then((ret) => {
    return res.status(200).send({
      err: null,
      message: 'Views increased.'
    })
  });
});

function dateParseShort(date) {
    let cdate = new Date(date);
    let cdate_string = ("0"+(cdate.getMonth()+1)).slice(-2) + '.' + ("0" + cdate.getDate()).slice(-2) + '.' + ("" + cdate.getFullYear()).slice(-2) + ' ' + ("0" + cdate.getHours()).slice(-2) + ":" + ("0" + cdate.getMinutes()).slice(-2) + ":" + ("0" + cdate.getSeconds()).slice(-2);
    return cdate_string;
}

app.get('/files', function(req, res) {

  var cond = { islive: false };
  if(req.params.user_id) {
    cond.user_id = req.params.user_id;
  }

  db.collection('streams').find(cond).sort({started: -1}).toArray((err, docs) => {
    docs = docs.map((doc) => {
      doc.thumb_url = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.thumb_url;
      doc.video_url = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.video_url;
      doc.event_name = doc.title;
      return doc;
    });
    if(err) {
      return res.status(400).send({
        err: 'failed',
        message: 'Error occured while getting video list'
      });
    }
    return res.status(200).send(docs);
  });
});

app.get('/api/videos/:user_id?', function(req, res) {
//app.get('/files', function(req, res) {

  var cond = { islive: false };
  if(req.params.user_id) {
    cond.user_id = req.params.user_id;
  }

  db.collection('streams').find(cond).sort({started: -1}).toArray((err, docs) => {
    docs = docs.map((doc) => {
      doc.thumb_url = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.thumb_url;
      doc.video_url = 'http://' + config.serverAddress + ':' + config.serverPort + '/' + doc.video_url;
      doc.event_name = doc.title;
      return doc;
    });
    if(err) {
      return res.status(400).send({
        err: 'failed',
        message: 'Error occured while getting video list'
      });
    }
    return res.status(200).send(docs);
  });
})

app.post('/api/series', (req, res) => {
  async.waterfall(
    [
      function(callback) {
        if(!req.body.title || !req.body.user_id) {
          callback('Error: empty title or user_id');
          return false;
        }
        callback(null);
      },

      function(callback) {
        db.collection('series').save({
          title: req.body.title,
          user_id: req.body.user_id,
          data: []
        }, (err, result) => {
          var doc = result.ops[0];
          callback(null, doc);
        });
      }
    ],
    function(err, result) {
      if(err) {
        res.status(400).send({
          err: 'failed',
          message: err //'Something went wrong'
        });
      }
      res.status(200).send({
        err: null,
        message: "Success",
        series_id: result._id
      })
    }
  );
});

app.post('/api/series/:series_id', (req, res) => {

  async.waterfall(
    [
      function(callback) {
        if(!req.params.series_id) {
          callback('Error: empty series id');
          return false;
        }
        callback(null);
      },
      function(callback) {
        var series_id = req.params.series_id;
        var stream_id = req.body.stream_id;

        if(!series[series_id]) {
          series[series_id] = [];
        }

        if(series[series_id].length>0) {
          series[series_id][series[series_id].length-1].proc.kill('SIGHUP');
        }

        db.collection('series').findOneAndUpdate(
            { _id: ObjectID(series_id)},
            {$addToSet: { data: { stream_id: stream_id.toString(), startat: new Date() }}},
            {
              returnOriginal: false
            }
        ).then((ret) => {
          var series_doc = ret.value;

          db.collection('streams').findOne({ _id: ObjectID(stream_id.toString()) }).then((doc) => {

            var dumpCmd = 'rtmpdump';
            var filename = `public/file/series/${series_doc.user_id}-${series_id}-${series_doc.data.length}.flv`;
            var dumpArgs = [
              '-v', 
              '-r', `rtmp://${serverAddr}/` + doc.stream_url,
              '-o', filename
            ];

            // console.log(dumpCmd, dumpArgs);

            var dumpProc = spawn(dumpCmd, dumpArgs);

            // dumpProc.on('close', (code, signal) => {
            //   console.log(
            //     `child process terminated due to receipt of signal ${signal}`);
            // });

            series[series_id].push({ proc: dumpProc, file: filename});

                // var convertArgs = [
                //   '-i',
                //   `"concat:` + series[series_id].map((series_seg) => series_seg.file).join('|') + `"`,
                //   '-c',
                //   'copy',
                //   'public/file/'+(new Date().getTime())+'.mp4'
                // ];
                // // setTimeout(function() {
                //   var convertProc = spawn('ffmpeg', convertArgs);
                //   convertProc.stdout.on('data', function(data) {
                //     console.log('stdout:',data);
                //   });
                //   convertProc.stderr.on('data', function(data) {
                //     console.log('stderr:',data);
                //   });
                //   convertProc.on('exit', function(code, signal) {
                //     console.log(code, signal);
                //   });
                //   console.log(convertArgs.join(' '));
                // }, 3000);
          });


          callback(null, series_doc);

        });
      }
    ],
    function(err, result) {
      if(err) {
        res.status(400).send({
          err: 'failed',
          message: err //'Something went wrong'
        });
      }

      res.status(200).send({
        err: null,
        message: "Success",
        series: result
      })
    }
  );
});

app.post('/api/series/stop/:series_id', (req, res) => {
  async.waterfall(
    [
      function(callback) {
        if(!req.params.series_id) {
          callback('Error: empty series id');
          return false;
        }
        callback(null);
      },
      function(callback) {
        db.collection('series').findOneAndUpdate(
            { _id: ObjectID(req.params.series_id)},
            {$addToSet: { data: { stream_id: '', startat: new Date() }}},
            {
              returnOriginal: false
            }
        ).then((ret) => {
          var doc = ret.value;

          var series_id = req.params.series_id;

          if(series[series_id].length>0) {
            series[series_id][series[series_id].length-1].proc.kill('SIGHUP');

            series[series_id][series[series_id].length-1].proc.on('close', function(code, signal) {

              var starttime = new Date(doc.data[0].startat).getTime();
              var endtime = new Date(doc.data[doc.data.length-1].startat).getTime();
              var destination = 'file/' + starttime + '-' + endtime + '-' + series_id + '.mp4';

              var txt = ``;
              series[series_id].forEach((series_seg) => {
                txt+= `file '${path.basename(series_seg.file)}' \r\n`;
              });
              var taskList = `public/file/series/${series_id}.txt`;
              fs.writeFile(taskList, txt, (err) => {
                if(err) throw err;
                var convertProc = spawn('ffmpeg', ['-f', 'concat', '-i', taskList, '-c', 'copy', 'public/'+destination]);
                convertProc.on('close', (code, signal) => {

                  series[series_id].forEach((series_seg) => {
                    fs.unlink(series_seg.file, function(err) {});
                  })
                  fs.unlink(taskList,function(err) {});

                  var screenshot_file_name = 'file/screenshots/'+starttime+'-'+series_id+'.png';
                  var screenshotProc = spawn('ffmpeg', [ '-i', 'public/'+destination, '-f', 'image2', '-vframes', '1', 'public/' + screenshot_file_name]);

                  var diff = endtime - starttime;
                  var hours = Math.floor(diff / 1000 / 60 / 60);
                  diff -= hours * 1000 * 60 * 60;
                  var minutes = Math.floor(diff / 1000 / 60);
                  diff -= minutes * 1000 * 60;
                  var seconds = Math.ceil(diff / 1000);

                  var duration = ("0"+hours).slice(-2) + ":" + ("0"+minutes).slice(-2) + ":" + ("0"+seconds).slice(-2);

                  db.collection('streams').save({
                    thumb_url: screenshot_file_name,
                    stream_url: '',
                    location: '',
                    views: 0,
                    title: doc.title,
                    key: '',
                    user_id: doc.user_id,
                    islive: false,
                    video_url: destination,
                    length: duration,
                    started: dateParseShort(starttime),
                    ended: dateParseShort(endtime)
                  }, (err, result) => {
                    console.log(result.ops[0]);
                  });

                });
              });
            });
          }

          callback(null, doc);
        });
      }
    ],
    function(err, result) {
      if(err) {
        res.status(400).send({
          err: 'failed',
          message: err //'Something went wrong'
        });
      }

      res.status(200).send({
        err: null,
        message: "Success",
        series: result
      })
    }
  )
});

// app.post('/api/test/', (req, res) => {
//     db.collection('streams').save({
//       thumb_url: '',
//       stream_url: '',
//       location: '',
//       views: 0,
//       title: 'test'+(new Date().getTime()),
//       key: (new Date().getTime()),
//       user_id: '1111111',
//       islive: true,
//       startedAt: new Date()
//     }, (err, result) => {
//       res.status(200).send({
//         data: result.ops[0]
//       });
//     });
// });

var rooms = {}

io.on('connection', function(socket) {

  socket.on('create_room', function(room) {
    if (!room.key) {
      return
    }
    console.log('create room:', room)
    var roomKey = room.key
    rooms[roomKey] = room
    var user_id = (room.key.split('_'))[0];
    db.collection('streams').save({
      thumb_url: '',
      stream_url: '',
      location: '',
      views: 0,
      title: room.title,
      key: room.key,
      user_id: user_id,
      islive: true,
      startedAt: new Date()
    }, (err, result) => {
      console.log(result.ops[0]);
    });
    socket.roomKey = roomKey
    socket.join(roomKey)
  })

  socket.on('close_room', function(roomKey) {
    console.log('close room:', roomKey)
    delete rooms[roomKey]
  })

  socket.on('disconnect', function() {
    console.log('disconnect:', socket.roomKey)
    if (socket.roomKey) {
      delete rooms[socket.roomKey]
    }
  })

  socket.on('join_room', function(roomKey) {
    console.log('join room:', roomKey)
    db.collection('streams').findOneAndUpdate({
      key: roomKey,
      islive: true
    }, {
      $inc: {
        views: 1
      }
    });
    socket.join(roomKey)
  })

  socket.on('upvote', function(roomKey) {
    console.log('upvote:', roomKey)
    io.to(roomKey).emit('upvote')
  })

  socket.on('gift', function(data) {
    console.log('gift:', data)
    io.to(data.roomKey).emit('gift', data)
  })

  socket.on('comment', function(data) {
    console.log('comment:', data)
    io.to(data.roomKey).emit('comment', data)
  })

})

app.get('*', (req, res) => res.status(200).send({
  message: 'Welcome to the HiveCast Backend',
}));

console.log(`listening on port ${port}...`)