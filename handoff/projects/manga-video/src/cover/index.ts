// 故乡税封面：npx remotion still src/cover/index.ts Cover3x4 out/cover/xxx.png
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { FurusatoCover } from './FurusatoCover';
import { IdecoCover } from './IdecoCover';
import { NisaCover } from './NisaCover';
import { NenchoCover } from './NenchoCover';
import { KakuteiCover } from './KakuteiCover';
import { KakuteiBCover } from './KakuteiBCover';
import { KyuyoCover } from './KyuyoCover';
import { AichosaCover } from './AichosaCover';
import { IryohiCover } from './IryohiCover';
import { AoiroCover } from './AoiroCover';
import { GenkaCover } from './GenkaCover';
import { KoteiCover } from './KoteiCover';
import { BankCover } from './BankCover';
import { SouzokuCover } from './SouzokuCover';
import { JutakuCover } from './JutakuCover';
import { IkkodateCover } from './IkkodateCover';
import { InvoiceCover } from './InvoiceCover';
import { InvoiceBCover } from './InvoiceBCover';
import { TateuriCover } from './TateuriCover';
import { RiboCover } from './RiboCover';

// 故乡税：Cover3x4…；iDeCo：Ideco3x4…；NISA：Nisa3x4…；年末调整：Nencho3x4…；确定申告：Kakutei3x4…；确定申告年度成绩单版：KakuteiB3x4…；工资里的税：Kyuyo3x4…；医疗费控除：Iryohi3x4…；青色申告：Aoiro3x4…；固定资产税：Kotei3x4…；银行和信用金库：Bank3x4…；遗产税：Souzoku3x4…；房子的折旧：Genka3x4…；Invoice 又改了：Invoice3x4…；Invoice 登记号办不办：InvoiceB3x4…；建売 vs 注文：Tateuri3x4…；リボ払い：Ribo3x4…（npx remotion still src/cover/index.ts Ideco16x9 out/cover/xxx.png）
const SIZES: Record<string, [number, number]> = { '3x4': [1080, 1440], '4x3': [1440, 1080], '9x16': [1080, 1920], '16x9': [1920, 1080] };
const COVERS: [string, React.FC<any>][] = [['Cover', FurusatoCover], ['Ideco', IdecoCover], ['Nisa', NisaCover], ['Nencho', NenchoCover], ['Kakutei', KakuteiCover], ['KakuteiB', KakuteiBCover], ['Kyuyo', KyuyoCover], ['Aichosa', AichosaCover], ['Iryohi', IryohiCover], ['Aoiro', AoiroCover], ['Kotei', KoteiCover], ['Bank', BankCover], ['Souzoku', SouzokuCover], ['Genka', GenkaCover], ['Jutaku', JutakuCover], ['Ikkodate', IkkodateCover], ['Invoice', InvoiceCover], ['InvoiceB', InvoiceBCover], ['Tateuri', TateuriCover], ['Ribo', RiboCover]];
registerRoot(() =>
  React.createElement(React.Fragment, null, COVERS.flatMap(([prefix, component]) => Object.entries(SIZES).map(([size, [W, H]]) =>
    React.createElement(Composition, { key: prefix + size, id: prefix + size, component, width: W, height: H, fps: 30, durationInFrames: 1, defaultProps: { W, H } })))),
);
