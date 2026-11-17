// 图解模板的独立入口：npx remotion render src/explainer/index.ts ExplainerVideo
// 漫画模板的 src/Root.tsx 写定后，也可以把 <ExplainerCompositions /> 挂进去，在同一个 Studio 里看。
import React from 'react';
import { registerRoot } from 'remotion';
import { ExplainerCompositions } from './Root';

registerRoot(() => React.createElement(ExplainerCompositions));
