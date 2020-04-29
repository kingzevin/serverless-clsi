//@ sourceMappingURL=OutputCacheManager.map
// Generated by CoffeeScript 1.6.0
(function() {
  var OutputCacheManager, OutputFileOptimiser, Path, Settings, async, crypto, fs, fse, logger, _;

  async = require("async");

  fs = require("fs");

  fse = require("fs-extra");

  Path = require("path");

  logger = require("logger-sharelatex");

  _ = require("underscore");

  Settings = require("settings-sharelatex");

  crypto = require("crypto");

  OutputFileOptimiser = require("./OutputFileOptimiser");

  module.exports = OutputCacheManager = {
    CACHE_SUBDIR: '.cache/clsi',
    ARCHIVE_SUBDIR: '.archive/clsi',
    BUILD_REGEX: /^[0-9a-f]+(-[0-9a-f]+)?$/,
    CACHE_LIMIT: 2,
    CACHE_AGE: 60 * 60 * 1000,
    path: function(buildId, file) {
      if (buildId.match(OutputCacheManager.BUILD_REGEX)) {
        return Path.join(OutputCacheManager.CACHE_SUBDIR, buildId, file);
      } else {
        return file;
      }
    },
    generateBuildId: function(callback) {
      if (callback == null) {
        callback = function(error, buildId) {};
      }
      return crypto.randomBytes(8, function(err, buf) {
        var date, random;
        if (err != null) {
          return callback(err);
        }
        random = buf.toString('hex');
        date = Date.now().toString(16);
        return callback(err, "" + date + "-" + random);
      });
    },
    saveOutputFiles: function(outputFiles, compileDir, callback) {
      if (callback == null) {
        callback = function(error) {};
      }
      return OutputCacheManager.generateBuildId(function(err, buildId) {
        if (err != null) {
          return callback(err);
        }
        return OutputCacheManager.saveOutputFilesInBuildDir(outputFiles, compileDir, buildId, callback);
      });
    },
    saveOutputFilesInBuildDir: function(outputFiles, compileDir, buildId, callback) {
      var cacheDir, cacheRoot, perUser, _ref, _ref1;
      if (callback == null) {
        callback = function(error) {};
      }
      cacheRoot = Path.join(compileDir, OutputCacheManager.CACHE_SUBDIR);
      cacheDir = Path.join(compileDir, OutputCacheManager.CACHE_SUBDIR, buildId);
      perUser = Path.basename(compileDir).match(/^[0-9a-f]{24}-[0-9a-f]{24}$/);
      if (((_ref = Settings.clsi) != null ? _ref.archive_logs : void 0) || ((_ref1 = Settings.clsi) != null ? _ref1.strace : void 0)) {
        OutputCacheManager.archiveLogs(outputFiles, compileDir, buildId, function(err) {
          if (err != null) {
            return logger.warn({
              err: err
            }, "erroring archiving log files");
          }
        });
      }
      return fse.ensureDir(cacheDir, function(err) {
        var results;
        if (err != null) {
          logger.error({
            err: err,
            directory: cacheDir
          }, "error creating cache directory");
          return callback(err, outputFiles);
        } else {
          results = [];
          return async.mapSeries(outputFiles, function(file, cb) {
            var dst, newFile, src, _ref2;
            if (OutputCacheManager._fileIsHidden(file.path)) {
              logger.debug({
                compileDir: compileDir,
                path: file.path
              }, "ignoring dotfile in output");
              return cb();
            }
            newFile = _.clone(file);
            _ref2 = [Path.join(compileDir, file.path), Path.join(cacheDir, file.path)], src = _ref2[0], dst = _ref2[1];
            // zevin: dump files to fs
            //   we upload the file to filestore instead.
            //   Path.join(compileDir, file.path)
            uploadToFilestore(compileDir, file.path, buildId)

            return OutputCacheManager._checkFileIsSafe(src, function(err, isSafe) {
              if (err != null) {
                return cb(err);
              }
              if (!isSafe) {
                return cb();
              }
              return OutputCacheManager._checkIfShouldCopy(src, function(err, shouldCopy) {
                if (err != null) {
                  return cb(err);
                }
                if (!shouldCopy) {
                  return cb();
                }
                return OutputCacheManager._copyFile(src, dst, function(err) {
                  if (err != null) {
                    return cb(err);
                  }
                  newFile.build = buildId;
                  results.push(newFile);
                  return cb();
                });
              });
            });
          }, function(err) {
            if (err != null) {
              callback(err, outputFiles);
              return fse.remove(cacheDir, function(err) {
                if (err != null) {
                  return logger.error({
                    err: err,
                    dir: cacheDir
                  }, "error removing cache dir after failure");
                }
              });
            } else {
              callback(err, results);
              return OutputCacheManager.expireOutputFiles(cacheRoot, {
                keep: buildId,
                limit: perUser ? 1 : null
              });
            }
          });
        }
      });
    },
    archiveLogs: function(outputFiles, compileDir, buildId, callback) {
      var archiveDir;
      if (callback == null) {
        callback = function(error) {};
      }
      archiveDir = Path.join(compileDir, OutputCacheManager.ARCHIVE_SUBDIR, buildId);
      logger.log({
        dir: archiveDir
      }, "archiving log files for project");
      return fse.ensureDir(archiveDir, function(err) {
        if (err != null) {
          return callback(err);
        }
        return async.mapSeries(outputFiles, function(file, cb) {
          var dst, src, _ref;
          _ref = [Path.join(compileDir, file.path), Path.join(archiveDir, file.path)], src = _ref[0], dst = _ref[1];
          return OutputCacheManager._checkFileIsSafe(src, function(err, isSafe) {
            if (err != null) {
              return cb(err);
            }
            if (!isSafe) {
              return cb();
            }
            return OutputCacheManager._checkIfShouldArchive(src, function(err, shouldArchive) {
              if (err != null) {
                return cb(err);
              }
              if (!shouldArchive) {
                return cb();
              }
              return OutputCacheManager._copyFile(src, dst, cb);
            });
          });
        }, callback);
      });
    },
    expireOutputFiles: function(cacheRoot, options, callback) {
      if (callback == null) {
        callback = function(error) {};
      }
      return fs.readdir(cacheRoot, function(err, results) {
        var currentTime, dirs, isExpired, removeDir, toRemove;
        if (err != null) {
          if (err.code === 'ENOENT') {
            return callback(null);
          }
          logger.error({
            err: err,
            project_id: cacheRoot
          }, "error clearing cache");
          return callback(err);
        }
        dirs = results.sort().reverse();
        currentTime = Date.now();
        isExpired = function(dir, index) {
          var age, dirTime, _ref;
          if ((options != null ? options.keep : void 0) === dir) {
            return false;
          }
          if (((options != null ? options.limit : void 0) != null) && index > options.limit) {
            return true;
          }
          if (index > OutputCacheManager.CACHE_LIMIT) {
            return true;
          }
          dirTime = parseInt((_ref = dir.split('-')) != null ? _ref[0] : void 0, 16);
          age = currentTime - dirTime;
          return age > OutputCacheManager.CACHE_AGE;
        };
        toRemove = _.filter(dirs, isExpired);
        removeDir = function(dir, cb) {
          return fse.remove(Path.join(cacheRoot, dir), function(err, result) {
            logger.log({
              cache: cacheRoot,
              dir: dir
            }, "removed expired cache dir");
            if (err != null) {
              logger.error({
                err: err,
                dir: dir
              }, "cache remove error");
            }
            return cb(err, result);
          });
        };
        return async.eachSeries(toRemove, function(dir, cb) {
          return removeDir(dir, cb);
        }, callback);
      });
    },
    _fileIsHidden: function(path) {
      return (path != null ? path.match(/^\.|\/\./) : void 0) != null;
    },
    _checkFileIsSafe: function(src, callback) {
      if (callback == null) {
        callback = function(error, isSafe) {};
      }
      return fs.stat(src, function(err, stats) {
        if ((err != null ? err.code : void 0) === 'ENOENT') {
          logger.warn({
            err: err,
            file: src
          }, "file has disappeared before copying to build cache");
          return callback(err, false);
        } else if (err != null) {
          logger.error({
            err: err,
            file: src
          }, "stat error for file in cache");
          return callback(err, false);
        } else if (!stats.isFile()) {
          logger.warn({
            src: src,
            stat: stats
          }, "nonfile output - refusing to copy to cache");
          return callback(null, false);
        } else {
          return callback(null, true);
        }
      });
    },
    _copyFile: function(src, dst, callback) {
      return fse.copy(src, dst, function(err) {
        var _ref;
        if ((err != null ? err.code : void 0) === 'ENOENT') {
          logger.warn({
            err: err,
            file: src
          }, "file has disappeared when copying to build cache");
          return callback(err, false);
        } else if (err != null) {
          logger.error({
            err: err,
            src: src,
            dst: dst
          }, "copy error for file in cache");
          return callback(err);
        } else {
          if ((_ref = Settings.clsi) != null ? _ref.optimiseInDocker : void 0) {
            return callback();
          } else {
            return OutputFileOptimiser.optimiseFile(src, dst, callback);
          }
        }
      });
    },
    _checkIfShouldCopy: function(src, callback) {
      if (callback == null) {
        callback = function(err, shouldCopy) {};
      }
      return callback(null, !Path.basename(src).match(/^strace/));
    },
    _checkIfShouldArchive: function(src, callback) {
      var _ref, _ref1;
      if (callback == null) {
        callback = function(err, shouldCopy) {};
      }
      if (Path.basename(src).match(/^strace/)) {
        return callback(null, true);
      }
      if (((_ref = Settings.clsi) != null ? _ref.archive_logs : void 0) && ((_ref1 = Path.basename(src)) === "output.log" || _ref1 === "output.blg")) {
        return callback(null, true);
      }
      return callback(null, false);
    }
  };

  function uploadToFilestore(compileDir, fileName, buildId){
    const projectId = Path.basename(compileDir);
    const fsPath = Path.join(compileDir, fileName)
    const readStream = fs.createReadStream(fsPath);
    readStream.on('open', function() {
      const filestoreUrl = Settings.apis.filestore? `http://${Settings.apis.filestore.url.host}:${Settings.apis.filestore.url.port}` : 'http://172.25.0.1:3009';
      const url = `${filestoreUrl}/project/${projectId}/file/output_${buildId}_${fileName}`;
      // from web, route to 
      const ONE_MIN_IN_MS = 60 * 1000
      const FIVE_MINS_IN_MS = ONE_MIN_IN_MS * 5
      
      const opts = {
        method: 'post',
        uri: url,
        timeout: FIVE_MINS_IN_MS,
      };
      const request = require('request')
      const writeStream = request(opts)
      writeStream.on('response', function(response) {
        if (![200, 201].includes(response.statusCode)) {
          err = new Error(
            `non-ok response from filestore for upload: ${
              response.statusCode
            }`
          )
          logger.warn(
            { err, statusCode: response.statusCode },
            'error uploading to filestore'
          )
        }
      }) 
      readStream.pipe(writeStream)
    });
  }

}).call(this);
