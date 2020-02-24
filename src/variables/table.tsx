// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ArrayExt } from '@lumino/algorithm';

import { ReactWidget } from '@jupyterlab/apputils';

import React, { useEffect, useRef, useState } from 'react';

import { VariablesModel } from './model';

import { IDebugger } from '../tokens';

import { CommandIDs } from '..';

import { CommandRegistry } from '@lumino/commands';

/**
 * The body for a table of variables.
 */
export class VariablesBodyTable extends ReactWidget {
  /**
   * Instantiate a new Body for the table of variables.
   * @param options The instantiation options for a VariablesBodyTable.
   */
  constructor(options: VariablesBodyTable.IOptions) {
    super();
    this._commands = options.commands;

    const model = options.model;
    model.changed.connect(this._updateScopes, this);

    this.addClass('jp-DebuggerVariables-body');
  }

  getBody(): HTMLElement {
    return this.node?.children[0]?.children[1] as HTMLElement;
  }

  /**
   * Render the VariablesComponent.
   */
  render() {
    return (
      <>
        {this._scopes.map(scope => (
          <VariablesComponent
            key={scope.name}
            data={scope.variables}
            commands={this._commands}
          />
        ))}
      </>
    );
  }

  /**
   * Update the scopes and the table of variables.
   * @param model The variables model.
   */
  private _updateScopes(model: VariablesModel) {
    if (ArrayExt.shallowEqual(this._scopes, model.scopes)) {
      return;
    }
    this._scopes = model.scopes;
    this.update();
  }

  private _scopes: VariablesModel.IScope[] = [];
  private _commands: CommandRegistry;
}

/**
 * A widget to display details for a variable.
 */
export class VariableDetails extends ReactWidget {
  /**
   * Instantiate a new Body for the detail table of the selected variable.
   * @param options The instantiation options for VariableDetails.
   */
  constructor(options: VariablesDetails.IOptions) {
    super();
    const { details, commands, model, service, title } = options;

    this.title.iconClass = 'jp-VariableIcon';
    this.title.label = `${service.session?.connection?.name} - details of ${title}`;

    this._variables = details;
    this._commands = commands;

    model.changed.connect(this._onModelChanged, this);

    this.addClass('jp-DebuggerVariableDetails');
  }

  /**
   * Render the VariablesComponent.
   */
  render() {
    return (
      <VariablesComponent data={this._variables} commands={this._commands} />
    );
  }

  /**
   * Handle when the debug model changes.
   */
  private _onModelChanged() {
    this.dispose();
  }

  private _variables: VariablesModel.IVariable[] = [];
  private _commands: CommandRegistry;
}

/**
 * A React component to display a table of variables.
 * @param data An array of variables.
 * @param service The debugger service.
 */
const VariablesComponent = ({
  data,
  commands
}: {
  data: VariablesModel.IVariable[];
  commands: CommandRegistry;
}) => {
  const [variables, setVariables] = useState(data);
  const [selected, setSelected] = useState(null);
  const bodyRef = useRef();

  useEffect(() => {
    setVariables(data);
    const bodyEle = bodyRef.current as HTMLElement;
    bodyEle.style.height = `${bodyEle.parentElement.parentElement.parentElement.offsetHeight}px`;
  }, [data]);

  const onVariableClicked = (variable: VariablesModel.IVariable) => {
    if (selected === variable) {
      return;
    }
    setSelected(variable);
  };

  const onVariableDoubleClicked = async (
    variable: VariablesModel.IVariable
  ) => {
    setSelected(variable);
    await commands.execute(CommandIDs.variableDetails, {
      variableReference: variable.variablesReference,
      title: variable.evaluateName
    });
  };

  const Tbody = (variables: VariablesModel.IVariable[]) => (
    <div ref={bodyRef} className="tableFlex-body">
      {variables?.map(variable => (
        <ul
          onDoubleClick={() => onVariableDoubleClicked(variable)}
          onClick={() => onVariableClicked(variable)}
          key={variable.evaluateName}
        >
          <li>{variable.name}</li>
          <li>{variable.type}</li>
          <li className={selected === variable ? 'selected' : ''}>
            {variable.value}
          </li>
        </ul>
      ))}
    </div>
  );

  /**
   * Event used for column resize.
   */
  const onMouseDown = (e: React.MouseEvent, index: number) => {
    const xStartPosition = e.clientX;
    const element = (e.target as HTMLElement).offsetParent as HTMLElement;
    const oldFlexBasis =
      element.style.flexBasis === ''
        ? 100
        : parseInt(element.style.flexBasis, 10);

    const setFlexInBody = (index: number, flexBasis: number) => {
      const uls = (bodyRef.current as HTMLElement).children;
      Array.from(uls).forEach(
        ul =>
          ((ul.children[
            index
          ] as HTMLElement).style.flexBasis = `${flexBasis}%`)
      );
    };

    const onMouseMove = (e: MouseEvent) => {
      const diff =
        index === 0 ? e.clientX - xStartPosition : xStartPosition - e.clientX;
      const flexBasis = oldFlexBasis + diff;

      element.style.flexBasis = `${flexBasis}%`;
      setFlexInBody(index, flexBasis);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handler = (index: number) => {
    const className = index === 0 ? 'handler rigth' : 'handler left';
    return (
      <div onMouseDown={e => onMouseDown(e, index)} className={className}></div>
    );
  };

  return (
    <div className="tableFlex">
      <div className="tableFlex-header">
        <ul>
          <li>Name {handler(0)}</li>
          <li>Type </li>
          <li>Value {handler(2)}</li>
        </ul>
      </div>
      {Tbody(variables)}
    </div>
  );
};

/**
 * A namespace for VariablesBodyTable `statics`.
 */
namespace VariablesBodyTable {
  /**
   * Instantiation options for `VariablesBodyTable`.
   */
  export interface IOptions {
    /**
     * The variables model.
     */
    model: VariablesModel;
    /**
     * The commands registry.
     */
    commands: CommandRegistry;
  }
}

/**
 * A namespace for VariablesDetails `statics`.
 */
namespace VariablesDetails {
  /**
   * Instantiation options for `VariablesDetails`.
   */
  export interface IOptions {
    /**
     * The variables model.
     */
    model: VariablesModel;
    /**
     * The details of the selected variable.
     */
    details: VariablesModel.IVariable[];
    /**
     * The debugger service.
     */
    service: IDebugger;
    /**
     * The commands registry.
     */
    commands: CommandRegistry;
    /**
     * The name of the selected variable.
     */
    title: string;
  }
}
