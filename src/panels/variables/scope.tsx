import { ReactWidget, UseSignal } from '@jupyterlab/apputils';

import { HTMLSelect } from '@jupyterlab/ui-components';

import React, { useState } from 'react';

import { IDebugger } from '../../tokens';

import { VariablesBodyGrid } from './grid';

import { VariablesBodyTree } from './tree';

/**
 * A React component to handle scope changes.
 *
 * @param {object} props The component props.
 * @param props.model The variables model.
 * @param props.tree The variables tree widget.
 * @param props.grid The variables grid widget.
 */
const ScopeSwitcherComponent = ({
  model,
  tree,
  grid
}: {
  model: IDebugger.Model.IVariables;
  tree: VariablesBodyTree;
  grid: VariablesBodyGrid;
}): JSX.Element => {
  const [value, setValue] = useState('-');
  const scopes = model.scopes;

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = event.target.value;
    setValue(value);
    tree.scope = value;
    grid.scope = value;
  };

  return (
    <HTMLSelect
      className={''}
      onChange={onChange}
      value={value}
      aria-label={'Scope'}
    >
      {scopes.map(scope => (
        <option key={scope.name} value={scope.name}>
          {scope.name}
        </option>
      ))}
    </HTMLSelect>
  );
};

/**
 * A widget to switch between scopes.
 */
export class ScopeSwitcher extends ReactWidget {
  /**
   * Instantiate a new scope switcher.
   *
   * @param options The instantiation options for a ScopeSwitcher
   */
  constructor(options: ScopeSwitcher.IOptions) {
    super();
    const { model, tree, grid } = options;
    this._model = model;
    this._tree = tree;
    this._grid = grid;
  }

  /**
   * Render the scope switcher.
   */
  render(): JSX.Element {
    return (
      <UseSignal signal={this._model.changed} initialSender={this._model}>
        {(): JSX.Element => (
          <ScopeSwitcherComponent
            model={this._model}
            tree={this._tree}
            grid={this._grid}
          />
        )}
      </UseSignal>
    );
  }

  private _model: IDebugger.Model.IVariables;
  private _tree: VariablesBodyTree;
  private _grid: VariablesBodyGrid;
}

/**
 * A namespace for ScopeSwitcher statics
 */
export namespace ScopeSwitcher {
  /**
   * The ScopeSwitcher instantiation options.
   */
  export interface IOptions {
    /**
     * The variables model.
     */
    model: IDebugger.Model.IVariables;

    /**
     * The variables tree viewer.
     */
    tree: VariablesBodyTree;

    /**
     * The variables table viewer.
     */
    grid: VariablesBodyGrid;
  }
}
