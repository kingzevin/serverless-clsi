//@ sourceMappingURL=CompileManager.map
// Generated by CoffeeScript 1.6.0
(function() {
  var CommandRunner, CompileManager, DraftModeManager, Errors, LatexRunner, LockManager, Metrics, OutputCacheManager, OutputFileFinder, Path, ResourceWriter, Settings, TikzManager, async, child_process, fs, fse, getCompileDir, getCompileName, logger, os;

  ResourceWriter = require("./ResourceWriter");

  LatexRunner = require("./LatexRunner");

  OutputFileFinder = require("./OutputFileFinder");

  OutputCacheManager = require("./OutputCacheManager");

  Settings = require("settings-sharelatex");

  Path = require("path");

  logger = require("logger-sharelatex");

  Metrics = require("./Metrics");

  child_process = require("child_process");

  DraftModeManager = require("./DraftModeManager");

  TikzManager = require("./TikzManager");

  LockManager = require("./LockManager");

  fs = require("fs");

  fse = require("fs-extra");

  os = require("os");

  async = require("async");

  Errors = require('./Errors');

  CommandRunner = require("./CommandRunner");

  getCompileName = function(project_id, user_id) {
    if (user_id != null) {
      return "" + project_id + "-" + user_id;
    } else {
      return project_id;
    }
  };

  getCompileDir = function(project_id, user_id) {
    return Path.join(Settings.path.compilesDir, getCompileName(project_id, user_id));
  };

  module.exports = CompileManager = {
    doCompileWithLock: function(request, callback) {
      var compileDir, lockFile;
      if (callback == null) {
        callback = function(error, outputFiles) {};
      }
      compileDir = getCompileDir(request.project_id, request.user_id);
      lockFile = Path.join(compileDir, ".project-lock");
      return fse.ensureDir(compileDir, function(error) {
        if (error != null) {
          return callback(error);
        }
        return LockManager.runWithLock(lockFile, function(releaseLock) {
          return CompileManager.doCompile(request, releaseLock);
        }, callback);
      });
    },
    doCompile: function(request, callback) {
      var compileDir, timer;
      if (callback == null) {
        callback = function(error, outputFiles) {};
      }
      compileDir = getCompileDir(request.project_id, request.user_id);
      timer = new Metrics.Timer("write-to-disk");
      logger.log({
        project_id: request.project_id,
        user_id: request.user_id
      }, "syncing resources to disk");
      return ResourceWriter.syncResourcesToDisk(request, compileDir, function(error, resourceList) {
        var createTikzFileIfRequired, env, injectDraftModeIfRequired, isLaTeXFile, _ref;
        if ((error != null) && error instanceof Errors.FilesOutOfSyncError) {
          logger.warn({
            project_id: request.project_id,
            user_id: request.user_id
          }, "files out of sync, please retry");
          return callback(error);
        } else if (error != null) {
          logger.err({
            err: error,
            project_id: request.project_id,
            user_id: request.user_id
          }, "error writing resources to disk");
          return callback(error);
        }
        logger.log({
          project_id: request.project_id,
          user_id: request.user_id,
          time_taken: Date.now() - timer.start
        }, "written files to disk");
        timer.done();
        injectDraftModeIfRequired = function(callback) {
          if (request.draft) {
            return DraftModeManager.injectDraftMode(Path.join(compileDir, request.rootResourcePath), callback);
          } else {
            return callback();
          }
        };
        createTikzFileIfRequired = function(callback) {
          return TikzManager.checkMainFile(compileDir, request.rootResourcePath, resourceList, function(error, needsMainFile) {
            if (error != null) {
              return callback(error);
            }
            if (needsMainFile) {
              return TikzManager.injectOutputFile(compileDir, request.rootResourcePath, callback);
            } else {
              return callback();
            }
          });
        };
        env = {};
        isLaTeXFile = (_ref = request.rootResourcePath) != null ? _ref.match(/\.tex$/i) : void 0;
        if ((request.check != null) && isLaTeXFile) {
          env['CHKTEX_OPTIONS'] = '-nall -e9 -e10 -w15 -w16';
          env['CHKTEX_ULIMIT_OPTIONS'] = '-t 5 -v 64000';
          if (request.check === 'error') {
            env['CHKTEX_EXIT_ON_ERROR'] = 1;
          }
          if (request.check === 'validate') {
            env['CHKTEX_VALIDATE'] = 1;
          }
        }
        return async.series([injectDraftModeIfRequired, createTikzFileIfRequired], function(error) {
          var compileName, tag, _ref1, _ref2, _ref3;
          if (error != null) {
            return callback(error);
          }
          timer = new Metrics.Timer("run-compile");
          tag = ((_ref1 = request.imageName) != null ? (_ref2 = _ref1.match(/:(.*)/)) != null ? (_ref3 = _ref2[1]) != null ? _ref3.replace(/\./g, '-') : void 0 : void 0 : void 0) || "default";
          if (!request.project_id.match(/^[0-9a-f]{24}$/)) {
            tag = "other";
          }
          Metrics.inc("compiles");
          Metrics.inc("compiles-with-image." + tag);
          compileName = getCompileName(request.project_id, request.user_id);
          // zevin: run compile here
          return LatexRunner.runLatex(compileName, {
            directory: compileDir,
            mainFile: request.rootResourcePath,
            compiler: request.compiler,
            timeout: request.timeout,
            image: request.imageName,
            flags: request.flags,
            environment: env
          }, function(error, output, stats, timings) {
            var loadavg, metric_key, metric_value, result, ts, _ref4, _ref5;
            if (request.check === "validate") {
              result = (error != null ? error.code : void 0) ? "fail" : "pass";
              error = new Error("validation");
              error.validate = result;
            }
            if (request.check === "error" && (error != null ? error.message : void 0) === 'exited') {
              error = new Error("compilation");
              error.validate = "fail";
            }
            if ((error != null ? error.terminated : void 0) || (error != null ? error.validate : void 0) || (error != null ? error.timedout : void 0)) {
              OutputFileFinder.findOutputFiles(resourceList, compileDir, function(err, outputFiles) {
                if (err != null) {
                  return callback(err);
                }
                error.outputFiles = outputFiles;
                return callback(error);
              });
              return;
            }
            if (error != null) {
              return callback(error);
            }
          // zevin: compile succeeded here
            Metrics.inc("compiles-succeeded");
            _ref4 = stats || {};
            for (metric_key in _ref4) {
              metric_value = _ref4[metric_key];
              Metrics.count(metric_key, metric_value);
            }
            _ref5 = timings || {};
            for (metric_key in _ref5) {
              metric_value = _ref5[metric_key];
              Metrics.timing(metric_key, metric_value);
            }
            loadavg = typeof os.loadavg === "function" ? os.loadavg() : void 0;
            if (loadavg != null) {
              Metrics.gauge("load-avg", loadavg[0]);
            }
            ts = timer.done();
            logger.log({
              project_id: request.project_id,
              user_id: request.user_id,
              time_taken: ts,
              stats: stats,
              timings: timings,
              loadavg: loadavg
            }, "done compile");
            if ((stats != null ? stats["latex-runs"] : void 0) > 0) {
              Metrics.timing("run-compile-per-pass", ts / stats["latex-runs"]);
            }
            if ((stats != null ? stats["latex-runs"] : void 0) > 0 && (timings != null ? timings["cpu-time"] : void 0) > 0) {
              Metrics.timing("run-compile-cpu-time-per-pass", timings["cpu-time"] / stats["latex-runs"]);
            }
            return OutputFileFinder.findOutputFiles(resourceList, compileDir, function(error, outputFiles) {
              if (error != null) {
                return callback(error);
              }
              // zevin: push outputFiles to filestore
              
              return OutputCacheManager.saveOutputFiles(outputFiles, compileDir, function(error, newOutputFiles) {
                return callback(null, newOutputFiles);
              });
            });
          });
        });
      });
    },
    stopCompile: function(project_id, user_id, callback) {
      var compileName;
      if (callback == null) {
        callback = function(error) {};
      }
      compileName = getCompileName(project_id, user_id);
      return LatexRunner.killLatex(compileName, callback);
    },
    clearProject: function(project_id, user_id, _callback) {
      var callback, compileDir;
      if (_callback == null) {
        _callback = function(error) {};
      }
      callback = function(error) {
        _callback(error);
        return _callback = function() {};
      };
      compileDir = getCompileDir(project_id, user_id);
      return CompileManager._checkDirectory(compileDir, function(err, exists) {
        var proc, stderr;
        if (err != null) {
          return callback(err);
        }
        if (!exists) {
          return callback();
        }
        proc = child_process.spawn("rm", ["-r", compileDir]);
        proc.on("error", callback);
        stderr = "";
        proc.stderr.on("data", function(chunk) {
          return stderr += chunk.toString();
        });
        return proc.on("close", function(code) {
          if (code === 0) {
            return callback(null);
          } else {
            return callback(new Error("rm -r " + compileDir + " failed: " + stderr));
          }
        });
      });
    },
    _findAllDirs: function(callback) {
      var root;
      if (callback == null) {
        callback = function(error, allDirs) {};
      }
      root = Settings.path.compilesDir;
      return fs.readdir(root, function(err, files) {
        var allDirs, file;
        if (err != null) {
          return callback(err);
        }
        allDirs = (function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = files.length; _i < _len; _i++) {
            file = files[_i];
            _results.push(Path.join(root, file));
          }
          return _results;
        })();
        return callback(null, allDirs);
      });
    },
    clearExpiredProjects: function(max_cache_age_ms, callback) {
      var expireIfNeeded, now;
      if (callback == null) {
        callback = function(error) {};
      }
      now = Date.now();
      expireIfNeeded = function(checkDir, cb) {
        return fs.stat(checkDir, function(err, stats) {
          var age, hasExpired;
          if (err != null) {
            return cb();
          }
          age = now - stats.mtime;
          hasExpired = age > max_cache_age_ms;
          if (hasExpired) {
            return fse.remove(checkDir, cb);
          } else {
            return cb();
          }
        });
      };
      return CompileManager._findAllDirs(function(error, allDirs) {
        if (error != null) {
          return callback();
        }
        return async.eachSeries(allDirs, expireIfNeeded, callback);
      });
    },
    _checkDirectory: function(compileDir, callback) {
      if (callback == null) {
        callback = function(error, exists) {};
      }
      return fs.lstat(compileDir, function(err, stats) {
        if ((err != null ? err.code : void 0) === 'ENOENT') {
          return callback(null, false);
        } else if (err != null) {
          logger.err({
            dir: compileDir,
            err: err
          }, "error on stat of project directory for removal");
          return callback(err);
        } else if (!(stats != null ? stats.isDirectory() : void 0)) {
          logger.err({
            dir: compileDir,
            stats: stats
          }, "bad project directory for removal");
          return callback(new Error("project directory is not directory"));
        } else {
          return callback(null, true);
        }
      });
    },
    syncFromCode: function(project_id, user_id, file_name, line, column, callback) {
      var base_dir, command, compileDir, compileName, file_path, synctex_path;
      if (callback == null) {
        callback = function(error, pdfPositions) {};
      }
      compileName = getCompileName(project_id, user_id);
      base_dir = Settings.path.synctexBaseDir(compileName);
      file_path = base_dir + "/" + file_name;
      compileDir = getCompileDir(project_id, user_id);
      synctex_path = "" + base_dir + "/output.pdf";
      command = ["code", synctex_path, file_path, line, column];
      return fse.ensureDir(compileDir, function(error) {
        if (error != null) {
          logger.err({
            error: error,
            project_id: project_id,
            user_id: user_id,
            file_name: file_name
          }, "error ensuring dir for sync from code");
          return callback(error);
        }
        return CompileManager._runSynctex(project_id, user_id, command, function(error, stdout) {
          if (error != null) {
            return callback(error);
          }
          logger.log({
            project_id: project_id,
            user_id: user_id,
            file_name: file_name,
            line: line,
            column: column,
            command: command,
            stdout: stdout
          }, "synctex code output");
          return callback(null, CompileManager._parseSynctexFromCodeOutput(stdout));
        });
      });
    },
    syncFromPdf: function(project_id, user_id, page, h, v, callback) {
      var base_dir, command, compileDir, compileName, synctex_path;
      if (callback == null) {
        callback = function(error, filePositions) {};
      }
      compileName = getCompileName(project_id, user_id);
      compileDir = getCompileDir(project_id, user_id);
      base_dir = Settings.path.synctexBaseDir(compileName);
      synctex_path = "" + base_dir + "/output.pdf";
      command = ["pdf", synctex_path, page, h, v];
      return fse.ensureDir(compileDir, function(error) {
        if (error != null) {
          logger.err({
            error: error,
            project_id: project_id,
            user_id: user_id,
            file_name: file_name
          }, "error ensuring dir for sync to code");
          return callback(error);
        }
        return CompileManager._runSynctex(project_id, user_id, command, function(error, stdout) {
          if (error != null) {
            return callback(error);
          }
          logger.log({
            project_id: project_id,
            user_id: user_id,
            page: page,
            h: h,
            v: v,
            stdout: stdout
          }, "synctex pdf output");
          return callback(null, CompileManager._parseSynctexFromPdfOutput(stdout, base_dir));
        });
      });
    },
    _checkFileExists: function(path, callback) {
      var synctexDir, synctexFile;
      if (callback == null) {
        callback = function(error) {};
      }
      synctexDir = Path.dirname(path);
      synctexFile = Path.join(synctexDir, "output.synctex.gz");
      return fs.stat(synctexDir, function(error, stats) {
        if ((error != null ? error.code : void 0) === 'ENOENT') {
          return callback(new Errors.NotFoundError("called synctex with no output directory"));
        }
        if (error != null) {
          return callback(error);
        }
        return fs.stat(synctexFile, function(error, stats) {
          if ((error != null ? error.code : void 0) === 'ENOENT') {
            return callback(new Errors.NotFoundError("called synctex with no output file"));
          }
          if (error != null) {
            return callback(error);
          }
          if (!(stats != null ? stats.isFile() : void 0)) {
            return callback(new Error("not a file"));
          }
          return callback();
        });
      });
    },
    _runSynctex: function(project_id, user_id, command, callback) {
      var compileName, directory, seconds, timeout, _ref;
      if (callback == null) {
        callback = function(error, stdout) {};
      }
      seconds = 1000;
      command.unshift("/opt/synctex");
      directory = getCompileDir(project_id, user_id);
      timeout = 60 * 1000;
      compileName = getCompileName(project_id, user_id);
      return CommandRunner.run(compileName, command, directory, (_ref = Settings.clsi) != null ? _ref.docker.image : void 0, timeout, {}, function(error, output) {
        if (error != null) {
          logger.err({
            err: error,
            command: command,
            project_id: project_id,
            user_id: user_id
          }, "error running synctex");
          return callback(error);
        }
        return callback(null, output.stdout);
      });
    },
    _parseSynctexFromCodeOutput: function(output) {
      var h, height, line, node, page, results, v, width, _i, _len, _ref, _ref1;
      results = [];
      _ref = output.split("\n");
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        line = _ref[_i];
        _ref1 = line.split("\t"), node = _ref1[0], page = _ref1[1], h = _ref1[2], v = _ref1[3], width = _ref1[4], height = _ref1[5];
        if (node === "NODE") {
          results.push({
            page: parseInt(page, 10),
            h: parseFloat(h),
            v: parseFloat(v),
            height: parseFloat(height),
            width: parseFloat(width)
          });
        }
      }
      return results;
    },
    _parseSynctexFromPdfOutput: function(output, base_dir) {
      var column, file, file_path, line, node, results, _i, _len, _ref, _ref1;
      results = [];
      _ref = output.split("\n");
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        line = _ref[_i];
        _ref1 = line.split("\t"), node = _ref1[0], file_path = _ref1[1], line = _ref1[2], column = _ref1[3];
        if (node === "NODE") {
          file = file_path.slice(base_dir.length + 1);
          results.push({
            file: file,
            line: parseInt(line, 10),
            column: parseInt(column, 10)
          });
        }
      }
      return results;
    },
    wordcount: function(project_id, user_id, file_name, image, callback) {
      var command, compileDir, compileName, file_path, timeout;
      if (callback == null) {
        callback = function(error, pdfPositions) {};
      }
      logger.log({
        project_id: project_id,
        user_id: user_id,
        file_name: file_name,
        image: image
      }, "running wordcount");
      file_path = "$COMPILE_DIR/" + file_name;
      command = ["texcount", '-nocol', '-inc', file_path, "-out=" + file_path + ".wc"];
      compileDir = getCompileDir(project_id, user_id);
      timeout = 60 * 1000;
      compileName = getCompileName(project_id, user_id);
      return fse.ensureDir(compileDir, function(error) {
        if (error != null) {
          logger.err({
            error: error,
            project_id: project_id,
            user_id: user_id,
            file_name: file_name
          }, "error ensuring dir for sync from code");
          return callback(error);
        }
        return CommandRunner.run(compileName, command, compileDir, image, timeout, {}, function(error) {
          if (error != null) {
            return callback(error);
          }
          return fs.readFile(compileDir + "/" + file_name + ".wc", "utf-8", function(err, stdout) {
            var results;
            if (err != null) {
              logger.err({
                node_err: err,
                command: command,
                compileDir: compileDir,
                project_id: project_id,
                user_id: user_id
              }, "error reading word count output");
              return callback(err);
            }
            results = CompileManager._parseWordcountFromOutput(stdout);
            logger.log({
              project_id: project_id,
              user_id: user_id,
              wordcount: results
            }, "word count results");
            return callback(null, results);
          });
        });
      });
    },
    _parseWordcountFromOutput: function(output) {
      var data, info, line, results, _i, _len, _ref, _ref1;
      results = {
        encode: "",
        textWords: 0,
        headWords: 0,
        outside: 0,
        headers: 0,
        elements: 0,
        mathInline: 0,
        mathDisplay: 0,
        errors: 0,
        messages: ""
      };
      _ref = output.split("\n");
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        line = _ref[_i];
        _ref1 = line.split(":"), data = _ref1[0], info = _ref1[1];
        if (data.indexOf("Encoding") > -1) {
          results['encode'] = info.trim();
        }
        if (data.indexOf("in text") > -1) {
          results['textWords'] = parseInt(info, 10);
        }
        if (data.indexOf("in head") > -1) {
          results['headWords'] = parseInt(info, 10);
        }
        if (data.indexOf("outside") > -1) {
          results['outside'] = parseInt(info, 10);
        }
        if (data.indexOf("of head") > -1) {
          results['headers'] = parseInt(info, 10);
        }
        if (data.indexOf("Number of floats/tables/figures") > -1) {
          results['elements'] = parseInt(info, 10);
        }
        if (data.indexOf("Number of math inlines") > -1) {
          results['mathInline'] = parseInt(info, 10);
        }
        if (data.indexOf("Number of math displayed") > -1) {
          results['mathDisplay'] = parseInt(info, 10);
        }
        if (data === "(errors") {
          results['errors'] = parseInt(info, 10);
        }
        if (line.indexOf("!!! ") > -1) {
          results['messages'] += line + "\n";
        }
      }
      return results;
    }
  };

}).call(this);
