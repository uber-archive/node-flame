#!/usr/bin/env node
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

/* global process, console */
/* eslint-disable no-console, no-process-exit */

var util = require('util');
var stackvis = require('stackvis');
var aggregation = require('../lib/aggregation');
var NodeProfiler = require('../index.js');
var StackVisAdaptor = require('../lib/stackvis-adaptor');
var Bunyan = require('bunyan');

var VALID_OUTPUT_FORMATS = ['text', 'flame', 'raw', 'fullraw'];
var MAX_TIME_SECONDS = 30;
var DEFAULT_SAMPLE_INTERVAL = 8;

var log = new Bunyan({
    'name': 'node-flame',
    'stream': process.stderr
});

function die(msg, err) {
    console.error(msg, err);
    process.exit(1);
}

function pidExists(pid) {
    // jscs:disable disallowKeywords
    try {
        process.kill(pid, 0);
    } catch (e) {
        return false;
    }
    // jscs:enable disallowKeywords

    return true;
}

function usage() {
    console.error('Usage: node-flame <pid> <text|flame|raw|fullraw> <duration (s)>');
    console.error('\ttext: textual flame graph.');
    console.error('\tflame: html flame graph.');
    console.error('\traw: format suitable for input to FlameGraph tools.');
    process.exit(1);
}

function parseArgs(argv) {
    if (argv.length !== 5) {
        usage();
    }

    var pid = parseInt(argv[2], 10);
    if (!isPositiveInteger(pid)) {
        die('Pid must be an integer');
    }

    var outputFormat = argv[3];
    if (VALID_OUTPUT_FORMATS.indexOf(outputFormat) === -1) {
        die('Output format must be "flame," "raw," or "text"');
    }

    var durationSeconds = parseFloat(argv[4]);
    if (!isPositive(durationSeconds)) {
        die('Duration must be an integer');
    }
    if (durationSeconds > MAX_TIME_SECONDS) {
        die(util.format('Sample for max %ds (for safety).', MAX_TIME_SECONDS));
    }

    return {
        pid: pid,
        outputFormat: outputFormat,
        durationSeconds: durationSeconds
    };
}

function outputText(stacks) {
    stacks.forEach(function reverse(stack) {
        stack.reverse();
    });
    console.log(aggregation.aggregate(stacks).display());
}

function outputFlameGraph(stacks) {
    /* eslint-disable new-cap */
    var reader = new stackvis.readerLookup('dtrace');
    var writer = new stackvis.writerLookup('flamegraph-d3');
    /* eslint-enable new-cap */

    var adaptor = new StackVisAdaptor(stacks);

    stackvis.pipeStacks(log, adaptor, reader, writer,
        process.stdout, function nop() {});

    adaptor.resume();
}

function outputDTraceText(stacks, mode) {
    var adaptor = new StackVisAdaptor(stacks, mode);
    adaptor.on('data', function outputData(data) {
        console.log(data.toString());
    });

    adaptor.resume();
}

function isPositiveInteger(num) {
    return typeof num === 'number' && num > 0 && num >> 0 === num;
}

function isPositive(num) {
    return typeof num === 'number' && num > 0 && !isNaN(num)
}

function main() {
    var args = parseArgs(process.argv);
    if (!pidExists(args.pid)) {
        die(util.format('Process %d does not exist.', args.pid));
    }

    console.error(util.format('Sampling %d for %ds, outputting %s.\n',
        args.pid, args.durationSeconds, args.outputFormat));

    var profiler = new NodeProfiler(console);
    var time = args.durationSeconds * 1000;
    profiler.profile(
        args.pid,
        time,
        DEFAULT_SAMPLE_INTERVAL,
        onProfileComplete
    );

    function onProfileComplete(err, stacks) {
        if (err) {
            return die('Exiting due to profiling failure.', err);
        }

        if (args.outputFormat === 'flame') {
            outputFlameGraph(stacks);
        } else if (args.outputFormat === 'raw') {
            outputDTraceText(stacks, 'raw');
        } else if (args.outputFormat === 'fullraw') {
            outputDTraceText(stacks, 'fullraw');
        } else {
            outputText(stacks);
        }
    }
}

if (require.main === module) {
    process.nextTick(main);
} else {
    module.exports = {
        parseArgs: parseArgs,
        pidExists: pidExists
    };
}

/*
var process = require('process');
var stackvis = require('stackvis');
var spawn = require('child_process').spawn;
var Bunyan = require('bunyan');

var Profiler = require('../index.js');
var StackVisAdaptor = require('../lib/stackvis-adaptor');

var log = new Bunyan({
    'name': 'torch',
    'stream': process.stderr
});

var childproc = spawn('node', ['spinny.js']);
var pid = childproc.pid;
var profiler = new Profiler();

profiler.profile(childproc.pid, 5000, 8, function onProfile(err, stacks) {
    if (err) {
        console.error('Error while profiling', err);
    } else {
        outputFlameGraph(stacks);
    }

    childproc.kill();
});

function outputFlameGraph(stacks) {
    var reader = new stackvis.readerLookup('dtrace');
    var writer = new stackvis.writerLookup('flamegraph-d3');

    var adaptor = new StackVisAdaptor(stacks);

    stackvis.pipeStacks(
        log,
        adaptor,
        reader,
        writer,
        process.stdout,
        function nop() {}
    );

    adaptor.resume();
}
*/
