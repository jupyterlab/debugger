// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Toolbar, ToolbarButton } from '@jupyterlab/apputils';

import { PanelLayout, Widget } from '@lumino/widgets';

/**
 * The header for a Variables Panel.
 */
export class VariablesHeader extends Widget {
  /**
   * Instantiate a new VariablesHeader.
   */
  constructor() {
    super({ node: document.createElement('header') });

    const button = new ToolbarButton({
      className: 'jp-SwitchButton',
      iconClass: 'jp-ToggleSwitch',
      onClick: function() {
        console.log('hi :)');
      },
      tooltip: 'Table / Tree View'
    });
    const title = new Widget({ node: document.createElement('h2') });
    title.node.textContent = 'Variables';

    const layout = new PanelLayout();
    layout.addWidget(button);
    layout.addWidget(title);
    layout.addWidget(this.toolbar);
    this.layout = layout;
  }

  /**
   * The toolbar for the callstack header.
   */
  readonly toolbar = new Toolbar();
}
