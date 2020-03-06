// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Toolbar } from '@jupyterlab/apputils';

import { PanelLayout, Widget } from '@lumino/widgets';
import { CaretWidget } from '../caretWidget';

/**
 * The header for a Variables Panel.
 */
export class VariablesHeader extends Widget {
  /**
   * Instantiate a new VariablesHeader.
   */
  constructor() {
    super({ node: document.createElement('header') });

    const title = new Widget({ node: document.createElement('h2') });
    title.node.textContent = 'Variables';

    const layout = new PanelLayout();
    const carret = new CaretWidget(0);

    layout.addWidget(carret);
    layout.addWidget(title);
    layout.addWidget(this.toolbar);
    this.layout = layout;
  }

  /**
   * The toolbar for the callstack header.
   */
  readonly toolbar = new Toolbar();
}
