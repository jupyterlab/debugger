// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { CodeEditor } from '@jupyterlab/codeeditor';

import { DebugService } from './service';

import { DebuggerEditors } from './editors';

import { DebuggerSidebar } from './sidebar';

import { ReadonlyJSONValue } from '@phosphor/coreutils';

import { IClientSession } from '@jupyterlab/apputils';

import { IDisposable } from '@phosphor/disposable';

import { Message } from '@phosphor/messaging';

import { ISignal, Signal } from '@phosphor/signaling';

import { SplitPanel } from '@phosphor/widgets';

import { IObservableString } from '@jupyterlab/observables';

import { IDebugger } from './tokens';

import { IDataConnector } from '@jupyterlab/coreutils';

export class Debugger implements IDebugger {
  constructor(options: Debugger.IOptions) {
    this.model = new Debugger.Model(options);
    this.service = new DebugService(this.model);
  }

  readonly model: Debugger.Model;
  readonly service: DebugService;

  get session(): IDebugger.ISession {
    return this.service.session;
  }

  set session(session: IDebugger.ISession) {
    this.service.session = session;
  }

  get mode(): IDebugger.Mode {
    return this.model.mode;
  }

  set mode(mode: IDebugger.Mode) {
    this.model.mode = mode;
  }
}

export class DebuggerWidget extends SplitPanel {
  constructor(options: Debugger.Widget.IOptions) {
    super({ orientation: 'horizontal' });
    this.title.label = 'Debugger';
    this.title.iconClass = 'jp-BugIcon';

    this.debug = options.debug;

    this.sidebar = new DebuggerSidebar();
    this.debug.model.sidebar = this.sidebar;

    const { editorFactory } = options;
    this.editors = new DebuggerEditors({ editorFactory });
    this.addWidget(this.editors);

    this.addClass('jp-Debugger');
  }

  readonly debug: Debugger;
  readonly editors: DebuggerEditors;
  readonly sidebar: DebuggerSidebar;

  get model(): Debugger.Model {
    return this.debug.model;
  }

  get service(): DebugService {
    return this.debug.service;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    super.dispose();
  }

  protected onAfterAttach(msg: Message) {
    this.addWidget(this.sidebar);
    this.sidebar.show();
  }
}

/**
 * A namespace for `Debugger` statics.
 */
export namespace Debugger {
  export interface IOptions {
    editorFactory: CodeEditor.Factory;
    connector?: IDataConnector<ReadonlyJSONValue>;
    session?: IClientSession;
  }

  export namespace Widget {
    export interface IOptions extends Debugger.IOptions {
      debug: Debugger;
    }
  }

  export class Model implements IDisposable {
    constructor(options: Debugger.Model.IOptions) {
      this.connector = options.connector || null;
      void this._populate();
    }

    readonly connector: IDataConnector<ReadonlyJSONValue> | null;

    get mode(): IDebugger.Mode {
      return this._mode;
    }

    set mode(mode: IDebugger.Mode) {
      if (this._mode === mode) {
        return;
      }
      this._mode = mode;
      this._modeChanged.emit(mode);
    }

    get sidebar() {
      return this._sidebar;
    }

    set sidebar(sidebar: DebuggerSidebar) {
      this._sidebar = sidebar;
    }

    get modeChanged(): ISignal<this, IDebugger.Mode> {
      return this._modeChanged;
    }

    get isDisposed(): boolean {
      return this._isDisposed;
    }

    get codeValue() {
      return this._codeValue;
    }

    set codeValue(observableString: IObservableString) {
      this._codeValue = observableString;
    }

    get currentLineChanged() {
      return this._currentLineChanged;
    }

    dispose(): void {
      this._isDisposed = true;
    }

    private async _populate(): Promise<void> {
      const { connector } = this;

      if (!connector) {
        return;
      }
    }

    private _codeValue: IObservableString;
    private _sidebar: DebuggerSidebar;
    private _isDisposed = false;
    private _mode: IDebugger.Mode;
    private _modeChanged = new Signal<this, IDebugger.Mode>(this);
    private _currentLineChanged = new Signal<this, number>(this);
  }

  export namespace Model {
    export interface IOptions extends Debugger.IOptions {}
  }
}
