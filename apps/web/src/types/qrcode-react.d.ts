declare module 'qrcode.react' {
  import * as React from 'react';
  export interface QRCodeProps {
    value: string;
    size?: number;
    level?: 'L' | 'M' | 'Q' | 'H';
    includeMargin?: boolean;
    renderAs?: 'canvas' | 'svg';
    bgColor?: string;
    fgColor?: string;
    className?: string;
    style?: React.CSSProperties;
  }
  export default class QRCode extends React.Component<QRCodeProps> {}
}
