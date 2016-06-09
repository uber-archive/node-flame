// Copyright (c) 2016 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

var fs = require('fs');
var setTimeout = require('timers').setTimeout;
var clearTimeout = require('timers').clearTimeout;

var atos = require('./lib/elf-atos/elf-atos.js');
var Tracer = require('./tracer.js');
var resolveSymbols = require('./lib/osx-atos.js');

var NATIVE_FRAME_REGEX = /\[native:(.*)\]/;

module.exports = NodeProfiler;

function NodeProfiler() {
    this.cpuProfile = [];
    this.duration = 0;
    this.interval = 0;
    this.isProfiling = false;
    this.pid = 0;
    this.profileTimer = null;
    this.sampleTimer = null;
    this.tracer = null;
}

NodeProfiler.prototype.profile = profile;
NodeProfiler.prototype.stopProfiling = stopProfiling;
NodeProfiler.prototype._sample = sample;
NodeProfiler.prototype._sampleAndContinue = sampleAndContinue;
NodeProfiler.prototype._resolveNativeFrames = resolveNativeFrames;
NodeProfiler.prototype._returnCPUProfile = returnCPUProfile;

function profile(pid, duration, interval, cb) {
    var self = this;

    if (self.isProfiling) {
        return cb(new Error(
            'Process tracer is already profiling CPU of pid ' + pid
        ));
    }

    if (!isPositiveInteger(pid)) {
        return cb(new Error(
            'Process pid must be a positive integer'
        ));
    }

    if (!isPositiveInteger(duration)) {
        return cb(new Error(
            'CPU Profiling duration in ms must be a positive integer'
        ));
    }

    if (!isPositiveInteger(interval)) {
        return cb(new Error(
            'CPU Profiling interval in ms must be a positive integer'
        ));
    }

    var tracer = self.tracer = new Tracer(pid);
    var result = tracer.attach(pid);

    if (!result) {
        cb(new Error('Error attaching to process with pid ' + pid));
    }

    self.pid = pid;
    self.isProfiling = true;
    self.cpuProfile = [];
    self.duration = duration;
    self.interval = interval;
    self.cb = cb;

    self.profileTimer = setTimeout(function onProfileEnd() {
        self.stopProfiling();
    }, duration);

    self.sampleTimer = setTimeout(function beginProfiling() {
        self._sampleAndContinue();
    }, interval);
}

function sampleAndContinue() {
    var self = this;

    if (!self.isProfiling) {
        return;
    }

    self._sample();
    self.sampleTimer = setTimeout(function onSample() {
        self._sampleAndContinue();
    }, self.interval);
}

function sample() {
    var self = this;
    var tracer = self.tracer;
    var backtrace = tracer.backtrace();

    if (backtrace) {
        self.cpuProfile.push(backtrace);
    }
}

function stopProfiling() {
    var self = this;
    var pid = self.pid;
    var tracer = self.tracer;
    var cb = self.cb;

    if (!self.isProfiling) {
        return;
    } else {
        self.isProfiling = false;
    }

    if (tracer.detach(pid)) {
        self._resolveNativeFrames(function onNativeResolve(err) {
            if (err) {
                return cb(err);
            }

            self._returnCPUProfile();
        });
    } else {
        cb(new Error(
            'Error detaching from process with pid ' + pid
        ));
    }
}

function resolveNativeFrames(cb) {
    var self = this;
    var frames = {};
    var framesArray = [];

    var cpuProfile = self.cpuProfile;

    if (!cpuProfile) {
        return;
    }

    for (var i = 0; i < cpuProfile.length; i++) {
        var stack = cpuProfile[i];

        for (var j = 0; j < stack.length; j++) {
            var annotation = stack[j];

            var match = annotation.match(NATIVE_FRAME_REGEX);
            if (match) {
                var addr = match[1];
                if (!frames[addr]) {
                    framesArray.push(addr);
                    frames[addr] = true;
                }
            }
        }
    }

    var symbolTable = resolveSymbols(self.pid, framesArray, function onSymbols(err, symbolTable) {
        if (err) {
            return cb(err);
        }
        replaceSymbols(cpuProfile, symbolTable);
        cb(null);
    });
}

function replaceSymbols(cpuProfile, symbolTable) {
    for (var i = 0; i < cpuProfile.length; i++) {
        var stack = cpuProfile[i];

        for (var j = 0; j < stack.length; j++) {
            var annotation = stack[j];

            var match = annotation.match(NATIVE_FRAME_REGEX);
            if (match) {
                stack[j] = (symbolTable[match[1]] || 'Unknown') + ':native';
            }
        }
    }
}

function returnCPUProfile() {
    var self = this;
    var cpuProfile = self.cpuProfile;
    var cb = self.cb;

    clearTimeout(self.profileTimer);
    clearTimeout(self.sampleTimer);
    self.cpuProfile = [];
    self.duration = 0;
    self.interval = 0;
    self.pid = 0;
    self.profileTimer = null;
    self.sampleTimer = null;
    self.tracer = null;

    return cb(null, cpuProfile);
}

function isPositiveInteger(num) {
    return typeof num === 'number' && num > 0 && num >> 0 === num;
}
