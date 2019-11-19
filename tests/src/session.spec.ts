// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { expect } from 'chai';

import { ClientSession, IClientSession } from '@jupyterlab/apputils';

import { createClientSession } from '@jupyterlab/testutils';

import { find } from '@phosphor/algorithm';

import { PromiseDelegate } from '@phosphor/coreutils';

import { DebugProtocol } from 'vscode-debugprotocol';

import { IDebugger } from '../../lib/tokens';

import { DebugSession } from '../../lib/session';

describe('DebugSession', () => {
  let client: IClientSession;

  beforeEach(async () => {
    client = await createClientSession({
      kernelPreference: {
        name: 'xpython'
      }
    });
    await (client as ClientSession).initialize();
    await client.kernel.ready;
  });

  afterEach(async () => {
    await client.shutdown();
  });

  describe('#isDisposed', () => {
    it('should return whether the object is disposed', () => {
      const debugSession = new DebugSession({ client });
      expect(debugSession.isDisposed).to.equal(false);
      debugSession.dispose();
      expect(debugSession.isDisposed).to.equal(true);
    });
  });

  describe('#eventMessage', () => {
    it('should be emitted when sending debug messages', async () => {
      const debugSession = new DebugSession({ client });
      let events: string[] = [];
      debugSession.eventMessage.connect((sender, event) => {
        events.push(event.event);
      });
      await debugSession.start();
      await debugSession.stop();
      expect(events).to.deep.equal(['output', 'initialized', 'process']);
    });
  });

  describe('#sendRequest', () => {
    let debugSession: DebugSession;

    beforeEach(async () => {
      debugSession = new DebugSession({ client });
      await debugSession.start();
    });

    afterEach(async () => {
      await debugSession.stop();
      debugSession.dispose();
    });

    it('should send debug messages to the kernel', async () => {
      const code = 'i=0\ni+=1\ni+=1';
      const reply = await debugSession.sendRequest('dumpCell', {
        code
      });
      expect(reply.body.sourcePath).to.contain('.py');
    });

    it('should handle replies with success false', async () => {
      const reply = await debugSession.sendRequest('evaluate', {
        expression: 'a'
      });
      const { success, message } = reply;
      expect(success).to.be.false;
      expect(message).to.contain('Unable to find thread for evaluation');
    });
  });
});

describe('protocol', () => {
  const code = [
    'i = 0',
    'i += 1',
    'i += 1',
    'j = i**2',
    'j += 1',
    'print(i, j)'
  ].join('\n');

  const breakpoints: DebugProtocol.SourceBreakpoint[] = [
    { line: 3 },
    { line: 5 }
  ];

  let client: IClientSession;
  let debugSession: DebugSession;
  let threadId: number = 1;

  beforeEach(async () => {
    client = await createClientSession({
      kernelPreference: {
        name: 'xpython'
      }
    });
    await (client as ClientSession).initialize();
    await client.kernel.ready;
    debugSession = new DebugSession({ client });
    await debugSession.start();

    const stoppedFuture = new PromiseDelegate<void>();
    debugSession.eventMessage.connect(
      (sender: DebugSession, event: IDebugger.ISession.Event) => {
        switch (event.event) {
          case 'thread':
            const msg = event as DebugProtocol.ThreadEvent;
            threadId = msg.body.threadId;
            break;
          case 'stopped':
            stoppedFuture.resolve();
            break;
          default:
            break;
        }
      }
    );

    const reply = await debugSession.sendRequest('dumpCell', {
      code
    });
    await debugSession.sendRequest('setBreakpoints', {
      breakpoints,
      source: { path: reply.body.sourcePath },
      sourceModified: false
    });
    await debugSession.sendRequest('configurationDone', {});

    // trigger an execute_request
    client.kernel.requestExecute({ code });

    // wait for the first stopped event
    await stoppedFuture.promise;
  });

  afterEach(async () => {
    await debugSession.stop();
    debugSession.dispose();
    await client.shutdown();
    client.dispose();
  });

  describe('#debugInfo', () => {
    it('should return the state of the current debug session', async () => {
      const reply = await debugSession.sendRequest('debugInfo', {});
      expect(reply.body.isStarted).to.be.true;

      const breakpoints = reply.body.breakpoints;
      // breakpoints are in the same file
      expect(breakpoints.length).to.equal(1);

      const breakpointsInfo = breakpoints[0];
      const breakpointLines = breakpointsInfo.breakpoints.map(bp => {
        return bp.line;
      });
      expect(breakpointLines).to.deep.equal([3, 5]);
    });
  });

  describe('#stackTrace', () => {
    it('should return the correct stackframes', async () => {
      const reply = await debugSession.sendRequest('stackTrace', {
        threadId
      });
      expect(reply.success).to.be.true;
      const stackFrames = reply.body.stackFrames;
      expect(stackFrames.length).to.equal(1);
      const frame = stackFrames[0];
      // first breakpoint
      expect(frame.line).to.equal(3);
    });
  });

  describe('#scopes', () => {
    it('should return the correct scopes', async () => {
      const stackFramesReply = await debugSession.sendRequest('stackTrace', {
        threadId
      });
      const frameId = stackFramesReply.body.stackFrames[0].id;
      const scopesReply = await debugSession.sendRequest('scopes', {
        frameId
      });
      const scopes = scopesReply.body.scopes;
      expect(scopes.length).to.equal(1);
      expect(scopes[0].name).to.equal('Locals');
    });
  });

  const getVariables = async () => {
    const stackFramesReply = await debugSession.sendRequest('stackTrace', {
      threadId
    });
    const frameId = stackFramesReply.body.stackFrames[0].id;
    const scopesReply = await debugSession.sendRequest('scopes', {
      frameId
    });
    const scopes = scopesReply.body.scopes;
    const variablesReference = scopes[0].variablesReference;
    const variablesReply = await debugSession.sendRequest('variables', {
      variablesReference
    });
    return variablesReply.body.variables;
  };

  describe('#variables', () => {
    it('should return the variables and their values', async () => {
      const variables = await getVariables();
      expect(variables.length).to.be.greaterThan(0);
      const i = find(variables, variable => variable.name === 'i');
      expect(i).to.exist;
      expect(i.type).to.equal('int');
      expect(i.value).to.equal('1');
    });
  });

  describe('#continue', () => {
    it('should proceed to the next breakpoint', async () => {
      let events: string[] = [];
      const eventsFuture = new PromiseDelegate<string[]>();
      debugSession.eventMessage.connect((sender, event) => {
        events.push(event.event);
        // aggregate the next 2 debug events
        if (events.length === 2) {
          eventsFuture.resolve(events);
        }
      });

      await debugSession.sendRequest('continue', { threadId });

      // wait for debug events
      const debugEvents = await eventsFuture.promise;
      expect(debugEvents).to.deep.equal(['continued', 'stopped']);

      const variables = await getVariables();
      const i = find(variables, variable => variable.name === 'i');
      expect(i).to.exist;
      expect(i.type).to.equal('int');
      expect(i.value).to.equal('2');

      const j = find(variables, variable => variable.name === 'j');
      expect(j).to.exist;
      expect(j.type).to.equal('int');
      expect(j.value).to.equal('4');
    });
  });

  describe('#loadedSources', () => {
    it('should *not* retrieve the list of loaded sources', async () => {
      // `loadedSources` is not supported at the moment "unknown command"
      const reply = await debugSession.sendRequest('loadedSources', {});
      expect(reply.success).to.be.false;
    });
  });

  describe('#source', () => {
    it('should retrieve the source of the dumped code cell', async () => {
      const stackFramesReply = await debugSession.sendRequest('stackTrace', {
        threadId
      });
      const frame = stackFramesReply.body.stackFrames[0];
      const source = frame.source;
      const reply = await debugSession.sendRequest('source', {
        source: { path: source.path },
        sourceReference: source.sourceReference
      });
      const sourceCode = reply.body.content;
      expect(sourceCode).to.equal(code);
    });
  });
});
