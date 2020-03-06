// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Panel, SplitPanel, Widget } from '@lumino/widgets';

import { caretDownIcon, caretLeftIcon } from '@jupyterlab/ui-components';

/**
 * The Carret Button for collapse in SplitPanel.
 */
export class CarretWidget extends Widget {
  openedHeight: string;
  /**
   * Instantiate a new CarretWidget.
   * @param indexWidget index of added widget in splitPanel
   */
  constructor() {
    super();

    const style = {
      className: 'jp-CarretButton',
      height: 'auto',
      width: '20px'
    };
    this.node.style.minWidth = '25px';

    this.carretLeft = caretLeftIcon.element(style);
    this.carretDown = caretDownIcon.element(style);
    this._onClick = this._onClick.bind(this);
    this.carretDown.onclick = this._onClick;
    this.node.append(this.carretDown);
    this.carretLeft.onclick = this._onClick;
  }

  private _onClick() {
    const splitPanel = (this.parent.parent.parent.parent as Panel)
      .widgets[1] as SplitPanel;
    const widget = this.parent.parent;
    const relativeSizes = splitPanel.relativeSizes();
    const hideClassHandler = ['lm-mod-hidden', 'p-mod-hidden'];
    const collapsedClass = 'collapsed';
    const isAllCollapsed =
      splitPanel.widgets.filter(
        (panels: Panel) => !panels.hasClass(collapsedClass)
      ).length === 1;

    const setRelativeSizes = () => {
      splitPanel.widgets.forEach((panel: Panel, index) => {
        const collapsed = panel.hasClass(collapsedClass);
        relativeSizes[index] = collapsed ? 0.008 : 0.1;
        if (collapsed) {
          panel.widgets[1].hide();
          splitPanel.handles[index].classList.add(...hideClassHandler);
        } else {
          splitPanel.handles[index].classList.remove(...hideClassHandler);
          panel.widgets[1].show();
        }
      });
      splitPanel.setRelativeSizes(relativeSizes);
    };

    if (this.isOpen) {
      if (isAllCollapsed) {
        return;
      }
      widget.toggleClass(collapsedClass);
      setRelativeSizes();
      this.node.removeChild(this.carretDown);
      this.node.append(this.carretLeft);
    } else {
      widget.toggleClass(collapsedClass);
      setRelativeSizes();
      this.node.removeChild(this.carretLeft);
      this.node.append(this.carretDown);
    }
    this.isOpen = !this.isOpen;
  }

  private carretLeft: HTMLElement;
  private carretDown: HTMLElement;
  private isOpen: boolean = true;
}
