// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Panel, SplitPanel, Widget } from '@lumino/widgets';

import { caretDownIcon, caretLeftIcon } from '@jupyterlab/ui-components';

/**
 * The Carret Button for collapse in SplitPanel.
 */
export class CaretWidget extends Widget {
  openedHeight: string;
  /**
   * Instantiate a new CarretWidget.
   * @param indexWidget index of added widget in splitPanel
   */
  constructor(indexWidget: number) {
    super();

    const style = {
      className: 'jp-CarretButton',
      height: 'auto',
      width: '20px'
    };
    this.node.style.minWidth = '25px';

    this.index = indexWidget;
    this.caretLeft = caretLeftIcon.element(style);
    this.caretDown = caretDownIcon.element(style);
    this._onClick = this._onClick.bind(this);
    this.caretDown.onclick = this._onClick;
    this.node.append(this.caretDown);
    this.caretLeft.onclick = this._onClick;
  }

  private moveClosedPanels(splitWidgets: Widget[]) {
    let index = 0;
    const setNextWidgetTop = (widget: Widget, nextWidget: Widget) => {
      if (nextWidget) {
        nextWidget.node.style.top = `${this.pixelToNumber(
          widget.node.style.top
        ) + 25}px`;
      }
    };

    for (const widget of splitWidgets) {
      const nextWidget = splitWidgets[index++ + 1] ?? null;
      setNextWidgetTop(widget, nextWidget);
      if (!nextWidget?.node.classList.contains('hide')) {
        break;
      }
    }
  }

  private moveOnOpenPanel(splitWidgets: Widget[], elements: HTMLDivElement[]) {
    let index = 0;
    const calculatePixelDiff = (h1: string, h2: string) =>
      this.pixelToNumber(h1) - this.pixelToNumber(h2);

    for (const widget of splitWidgets) {
      widget.node.style.top = `${this.pixelToNumber(this.openedHeight) +
        this.pixelToNumber(widget.node.style.top)}px`;
      elements[index++].style.top = widget.node.style.top;
      const diffPixel = calculatePixelDiff(
        splitWidgets[index]?.node.style.top,
        widget.node.style.top
      );
      if (
        !widget.node.classList.contains('hide') &&
        diffPixel !== 25 &&
        diffPixel !== -38
      ) {
        break;
      }
    }
  }

  private pixelToNumber(pixels: string): number {
    return Number(pixels?.slice(0, -2));
  }

  private _onClick() {
    const splitpanel = (this.parent.parent.parent.parent as Panel)
      .widgets[1] as SplitPanel;

    const hideClassHandler = ['lm-mod-hidden', 'p-mod-hidden'];
    const hideClassPanel = 'hide';
    const clickedWidget = splitpanel.widgets[this.index];

    if (this.isOpen) {
      this.openedHeight = clickedWidget.node.style.height;
      clickedWidget.node.style.height = '25px';
      this.moveClosedPanels(splitpanel.widgets.slice(this.index));
      this.node.removeChild(this.caretDown);
      this.node.append(this.caretLeft);
      splitpanel.handles[this.index].classList.add(...hideClassHandler);
      clickedWidget.node.classList.add(hideClassPanel);
    } else {
      clickedWidget.node.style.height = this.openedHeight;
      this.node.removeChild(this.caretLeft);
      this.node.append(this.caretDown);
      splitpanel.handles[this.index].classList.remove(...hideClassHandler);
      clickedWidget.node.classList.remove(hideClassPanel);
      this.moveOnOpenPanel(
        splitpanel.widgets.slice(this.index + 1),
        splitpanel.handles.slice(this.index)
      );
    }
    this.isOpen = !this.isOpen;
  }

  private index: number;
  private caretLeft: HTMLElement;
  private caretDown: HTMLElement;
  private isOpen: boolean = true;
}
