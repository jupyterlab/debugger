// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Panel, SplitPanel, Widget } from '@lumino/widgets';

import { caretDownIcon, caretLeftIcon } from '@jupyterlab/ui-components';

/**
 * The Caret Button for collapse in SplitPanel.
 */
export class CaretWidget extends Widget {
  openedHeight: string;
  /**
   * Instantiate a new CaretWidget.
   */
  constructor() {
    super();

    const style = {
      className: 'jp-CaretButton',
      height: 'auto',
      width: '20px'
    };
    this.node.style.minWidth = '25px';

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
      if (!(nextWidget as Panel)?.widgets[1].isHidden) {
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
        !(widget as Panel).widgets[1].isHidden &&
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

  private _onClick(e: MouseEvent) {
    const clickedWidget = this.parent.parent as Panel;
    const splitpanel = (this.parent.parent.parent.parent as Panel)
      .widgets[1] as SplitPanel;
    const index = splitpanel.widgets.findIndex(
      widget => clickedWidget === widget
    );
    const hideClassHandler = ['lm-mod-hidden', 'p-mod-hidden'];

    if (this.isOpen) {
      this.openedHeight = clickedWidget.node.style.height;
      clickedWidget.node.style.height = '25px';
      this.moveClosedPanels(splitpanel.widgets.slice(index));
      this.node.removeChild(this.caretDown);
      this.node.append(this.caretLeft);
      if (index !== 0) {
        splitpanel.handles[index - 1].classList.add(...hideClassHandler);
      }
      clickedWidget.widgets[1].hide();
    } else {
      clickedWidget.node.style.height = this.openedHeight;
      this.node.removeChild(this.caretLeft);
      this.node.append(this.caretDown);
      if (index !== 0) {
        splitpanel.handles[index - 1].classList.remove(...hideClassHandler);
      }
      if (
        splitpanel.widgets.length < index + 1 &&
        !splitpanel.widgets[index + 1].isHidden
      ) {
        splitpanel.handles[index].classList.remove(...hideClassHandler);
      }
      clickedWidget.widgets[1].show();
      this.moveOnOpenPanel(
        splitpanel.widgets.slice(index + 1),
        splitpanel.handles.slice(index)
      );
    }
    this.isOpen = !this.isOpen;
  }

  private caretLeft: HTMLElement;
  private caretDown: HTMLElement;
  private isOpen: boolean = true;
}
