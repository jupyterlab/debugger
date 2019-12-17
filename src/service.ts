// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ClientSession, IClientSession } from '@jupyterlab/apputils';

import { Session } from '@jupyterlab/services';

import { IDisposable } from '@phosphor/disposable';

import { ISignal, Signal } from '@phosphor/signaling';

import { murmur2 } from 'murmurhash-js';

import { DebugProtocol } from 'vscode-debugprotocol';

import { Debugger } from './debugger';

import { IDebugger } from './tokens';

import { Variables } from './variables';

import { Callstack } from './callstack';

/**
 * A concrete implementation of IDebugger.
 */
export class DebugService implements IDebugger, IDisposable {
  constructor() {
    // Avoids setting session with invalid client
    // session should be set only when a notebook or
    // a console get the focus.
    // TODO: also checks that the notebook or console
    // runs a kernel with debugging ability
    this._session = null;
    // The model will be set by the UI which can be built
    // after the service.
    this._model = null;
  }

  /**
   * Whether the debug service is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Whether the current debugger is started.
   */
  get isStarted(): boolean {
    return this._session?.isStarted ?? false;
  }

  /**
   * Returns the current debug session.
   */
  get session(): IDebugger.ISession {
    return this._session;
  }

  /**
   * Sets the current debug session to the given parameter.
   * @param session - the new debugger session.
   */
  set session(session: IDebugger.ISession) {
    if (this._session === session) {
      return;
    }
    if (this._session) {
      this._session.dispose();
    }
    this._session = session;

    this._session?.eventMessage.connect((_, event) => {
      if (event.event === 'stopped') {
        this._model.stoppedThreads.add(event.body.threadId);
        void this._getAllFrames();
      } else if (event.event === 'continued') {
        this._model.stoppedThreads.delete(event.body.threadId);
        this._clearModel();
        this._clearSignals();
      }
      this._eventMessage.emit(event);
    });
    this._sessionChanged.emit(session);
  }

  /**
   * Returns the debugger model.
   */
  get model(): IDebugger.IModel {
    return this._model;
  }

  /**
   * Sets the debugger model to the given parameter.
   * @param model - The new debugger model.
   */
  set model(model: IDebugger.IModel) {
    this._model = model as Debugger.Model;
    this._modelChanged.emit(model);
  }

  /**
   * Signal emitted upon session changed.
   */
  get sessionChanged(): ISignal<IDebugger, IDebugger.ISession> {
    return this._sessionChanged;
  }

  /**
   * Signal emitted upon model changed.
   */
  get modelChanged(): ISignal<IDebugger, IDebugger.IModel> {
    return this._modelChanged;
  }

  /**
   * Signal emitted for debug event messages.
   */
  get eventMessage(): ISignal<IDebugger, IDebugger.ISession.Event> {
    return this._eventMessage;
  }

  /**
   * Request whether debugging is available for the given client.
   * @param client The client session.
   */
  async isAvailable(
    client: IClientSession | Session.ISession
  ): Promise<boolean> {
    if (client instanceof ClientSession) {
      await client.ready;
    }
    await client.kernel.ready;
    const info = (client.kernel?.info as IDebugger.ISession.IInfoReply) ?? null;
    return !!(info?.debugger ?? false);
  }

  /**
   * Dispose the debug service.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    Signal.clearData(this);
  }

  /**
   * Computes an id based on the given code.
   */
  getCodeId(code: string): string {
    return this._tmpFilePrefix + this._hashMethod(code) + this._tmpFileSuffix;
  }

  /**
   * Whether there exists a thread in stopped state.
   */
  hasStoppedThreads(): boolean {
    return this._model?.stoppedThreads.size > 0 ?? false;
  }

  /**
   * Starts a debugger.
   * Precondition: !isStarted
   */
  async start(): Promise<void> {
    await this.session.start();
  }

  /**
   * Stops the debugger.
   * Precondition: isStarted
   */
  async stop(): Promise<void> {
    await this.session.stop();
    if (this.model) {
      // TODO: create a more generic cleanup method?
      this._model.stoppedThreads.clear();
      const breakpoints = new Map<string, IDebugger.IBreakpoint[]>();
      this._model.breakpoints.restoreBreakpoints(breakpoints);
      this._clearModel();
    }
  }

  /**
   * Restarts the debugger.
   * Precondition: isStarted.
   */
  async restart(): Promise<void> {
    const breakpoints = this._model.breakpoints.breakpoints;
    await this.stop();
    await this.start();

    // No need to dump the cells again, we can simply
    // resend the breakpoints to the kernel and update
    // the model.
    for (const [source, bps] of breakpoints) {
      const sourceBreakpoints = Private.toSourceBreakpoints(bps);
      await this._setBreakpoints(sourceBreakpoints, source);
    }
    this._model.breakpoints.restoreBreakpoints(breakpoints);
  }

  /**
   * Restore the state of a debug session.
   * @param autoStart - when true, starts the debugger
   * if it has not been started yet.
   */
  async restoreState(autoStart: boolean): Promise<void> {
    if (!this.model || !this.session) {
      return;
    }

    const reply = await this.session.restoreState();

    this._setHashParameters(reply.body.hashMethod, reply.body.hashSeed);
    this._setTmpFileParameters(
      reply.body.tmpFilePrefix,
      reply.body.tmpFileSuffix
    );

    const breakpoints = reply.body.breakpoints;
    let bpMap = new Map<string, IDebugger.IBreakpoint[]>();
    if (breakpoints.length !== 0) {
      breakpoints.forEach((bp: IDebugger.ISession.IDebugInfoBreakpoints) => {
        bpMap.set(
          bp.source,
          bp.breakpoints.map(breakpoint => {
            return {
              ...breakpoint,
              active: true
            };
          })
        );
      });
    }

    const stoppedThreads = new Set(reply.body.stoppedThreads);
    this._model.stoppedThreads = stoppedThreads;

    if (!this.isStarted && (autoStart || stoppedThreads.size !== 0)) {
      await this.start();
    }

    this._model.breakpoints.restoreBreakpoints(bpMap);
    if (stoppedThreads.size !== 0) {
      await this._getAllFrames();
    } else {
      this._clearModel();
      this._clearSignals();
    }
  }

  /**
   * Continues the execution of the current thread.
   */
  async continue(): Promise<void> {
    try {
      await this.session.sendRequest('continue', {
        threadId: this._currentThread()
      });
      this._model.stoppedThreads.delete(this._currentThread());
    } catch (err) {
      console.error('Error:', err.message);
    }
  }

  /**
   * Makes the current thread run again for one step.
   */
  async next(): Promise<void> {
    try {
      await this.session.sendRequest('next', {
        threadId: this._currentThread()
      });
    } catch (err) {
      console.error('Error:', err.message);
    }
  }

  /**
   * Makes the current thread step in a function / method if possible.
   */
  async stepIn(): Promise<void> {
    try {
      await this.session.sendRequest('stepIn', {
        threadId: this._currentThread()
      });
    } catch (err) {
      console.error('Error:', err.message);
    }
  }

  /**
   * Makes the current thread step out a function / method if possible.
   */
  async stepOut(): Promise<void> {
    try {
      await this.session.sendRequest('stepOut', {
        threadId: this._currentThread()
      });
    } catch (err) {
      console.error('Error:', err.message);
    }
  }

  /**
   * Update all breakpoints at once.
   * @param code - The code in the cell where the breakpoints are set.
   * @param breakpoints - The list of breakpoints to set.
   * @param path - Optional path to the file where to set the breakpoints.
   */
  async updateBreakpoints(
    code: string,
    breakpoints: IDebugger.IBreakpoint[],
    path?: string
  ) {
    if (!this.session.isStarted) {
      return;
    }
    if (!path) {
      const dumpedCell = await this.dumpCell(code);
      path = dumpedCell.sourcePath;
    }
    const sourceBreakpoints = Private.toSourceBreakpoints(breakpoints);
    const reply = await this._setBreakpoints(sourceBreakpoints, path);
    let kernelBreakpoints = reply.body.breakpoints.map(breakpoint => {
      return {
        ...breakpoint,
        active: true
      };
    });

    // filter breakpoints with the same line number
    kernelBreakpoints = kernelBreakpoints.filter(
      (breakpoint, i, arr) =>
        arr.findIndex(el => el.line === breakpoint.line) === i
    );
    this._model.breakpoints.setBreakpoints(path, kernelBreakpoints);
    await this.session.sendRequest('configurationDone', {});
  }

  /**
   * Clear all the breakpoints for the current session.
   */
  async clearBreakpoints() {
    if (!this.session.isStarted) {
      return;
    }

    if (!this.session.client.isDisposed) {
      this._model.breakpoints.breakpoints.forEach(
        async (breakpoints, path, _) => {
          await this._setBreakpoints([], path);
        }
      );
    }

    let bpMap = new Map<string, IDebugger.IBreakpoint[]>();
    this._model.breakpoints.restoreBreakpoints(bpMap);
  }

  /**
   * Retrieve the content of a source file.
   * @param source The source object containing the path to the file.
   */
  async getSource(source: DebugProtocol.Source) {
    const reply = await this.session.sendRequest('source', {
      source,
      sourceReference: source.sourceReference
    });
    return { ...reply.body, path: source.path };
  }

  /**
   * Dump the content of a cell.
   * @param code The source code to dump.
   */
  async dumpCell(code: string) {
    const reply = await this.session.sendRequest('dumpCell', { code });
    return reply.body;
  }

  /**
   * Get all the frames from the kernel.
   */
  private async _getAllFrames() {
    this._model.callstack.currentFrameChanged.connect(
      this._onChangeFrame,
      this
    );
    this._model.variables.variableExpanded.connect(
      this._onVariableExpanded,
      this
    );

    const stackFrames = await this._getFrames(this._currentThread());
    this._model.callstack.frames = stackFrames;
  }

  /**
   * Handle a change of the current active frame.
   */
  private async _onChangeFrame(_: Callstack.Model, frame: Callstack.IFrame) {
    if (!frame) {
      return;
    }
    const scopes = await this._getScopes(frame);
    const variables = await this._getVariables(scopes[0]);
    const variableScopes = this._convertScopes(scopes, variables);
    this._model.variables.scopes = variableScopes;
  }

  /**
   * Handle a variable expanded event and request variables from the kernel.
   */
  private async _onVariableExpanded(_: any, variable: DebugProtocol.Variable) {
    const reply = await this.session.sendRequest('variables', {
      variablesReference: variable.variablesReference
    });
    let newVariable = { ...variable, expanded: true };

    reply.body.variables.forEach((variable: DebugProtocol.Variable) => {
      newVariable = { [variable.name]: variable, ...newVariable };
    });

    const newScopes = this._model.variables.scopes.map(scope => {
      const findIndex = scope.variables.findIndex(
        ele => ele.variablesReference === variable.variablesReference
      );
      scope.variables[findIndex] = newVariable;
      return { ...scope };
    });

    this._model.variables.scopes = [...newScopes];

    return reply.body.variables;
  }

  /**
   * Get all the frames for the given thread id.
   * @param threadId The thread id.
   */
  private async _getFrames(threadId: number) {
    const reply = await this.session.sendRequest('stackTrace', {
      threadId
    });
    const stackFrames = reply.body.stackFrames;
    return stackFrames;
  }

  /**
   * Get all the scopes for the given frame.
   * @param frame The frame.
   */
  private async _getScopes(frame: DebugProtocol.StackFrame) {
    if (!frame) {
      return;
    }
    const reply = await this.session.sendRequest('scopes', {
      frameId: frame.id
    });
    return reply.body.scopes;
  }

  /**
   * Get the variables for a given scope.
   * @param scopes The scope.
   */
  private async _getVariables(scope: DebugProtocol.Scope) {
    if (!scope) {
      return;
    }
    const reply = await this.session.sendRequest('variables', {
      variablesReference: scope.variablesReference
    });
    return reply.body.variables;
  }

  /**
   * Set the breakpoints for a given file.
   * @param breakpoints The list of breakpoints to set.
   * @param path The path to where to set the breakpoints.
   */
  private async _setBreakpoints(
    breakpoints: DebugProtocol.SourceBreakpoint[],
    path: string
  ) {
    return await this.session.sendRequest('setBreakpoints', {
      breakpoints: breakpoints,
      source: { path },
      sourceModified: false
    });
  }

  /**
   * Map a list of scopes to a list of variables.
   * @param scopes The list of scopes.
   * @param variables The list of variables.
   */
  private _convertScopes(
    scopes: DebugProtocol.Scope[],
    variables: DebugProtocol.Variable[]
  ): Variables.IScope[] {
    if (!variables || !scopes) {
      return;
    }
    return scopes.map(scope => {
      return {
        name: scope.name,
        variables: variables.map(variable => {
          return { ...variable };
        })
      };
    });
  }

  /**
   * Clear the current model.
   */
  private _clearModel() {
    this._model.callstack.frames = [];
    this._model.variables.scopes = [];
  }

  /**
   * Clear the signals set on the model.
   */
  private _clearSignals() {
    this._model.callstack.currentFrameChanged.disconnect(
      this._onChangeFrame,
      this
    );
    this._model.variables.variableExpanded.disconnect(
      this._onVariableExpanded,
      this
    );
  }

  /**
   * Get the current thread from the model.
   */
  private _currentThread(): number {
    // TODO: ask the model for the current thread ID
    return 1;
  }

  /**
   * Set the hash parameters for the current session.
   * @param method The hash method.
   * @param seed The seed for the hash method.
   */
  private _setHashParameters(method: string, seed: number) {
    if (method === 'Murmur2') {
      this._hashMethod = (code: string) => {
        return murmur2(code, seed).toString();
      };
    } else {
      throw new Error('hash method not supported ' + method);
    }
  }

  /**
   * Set the parameters used for the temporary files (e.g. cells).
   * @param prefix The prefix used for the temporary files.
   * @param suffix The suffix used for the temporary files.
   */
  private _setTmpFileParameters(prefix: string, suffix: string) {
    this._tmpFilePrefix = prefix;
    this._tmpFileSuffix = suffix;
  }

  private _isDisposed: boolean = false;
  private _session: IDebugger.ISession;
  private _model: Debugger.Model;
  private _sessionChanged = new Signal<IDebugger, IDebugger.ISession>(this);
  private _modelChanged = new Signal<IDebugger, IDebugger.IModel>(this);
  private _eventMessage = new Signal<IDebugger, IDebugger.ISession.Event>(this);

  private _hashMethod: (code: string) => string;
  private _tmpFilePrefix: string;
  private _tmpFileSuffix: string;
}

/**
 * A namespace for module private data.
 */
namespace Private {
  /**
   * Convert a list of breakpoints to source breakpoints to be sent to the kernel.
   * @param breakpoints The list of breakpoints.
   */
  export function toSourceBreakpoints(breakpoints: IDebugger.IBreakpoint[]) {
    return breakpoints.map(breakpoint => {
      return {
        line: breakpoint.line
      };
    });
  }
}
