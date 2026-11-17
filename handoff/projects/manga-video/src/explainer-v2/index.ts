// 图解 v2 试作（15 秒无声）：npx remotion render src/explainer-v2/index.ts FurusatoV2
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { OneMoneyTwoTimes, V2_DURATION } from './OneMoneyTwoTimes';
import { CharacterSheet } from './CharacterSheet';
import { HandTest } from './HandTest';
import { HandRef } from './HandRef';

registerRoot(() =>
  React.createElement(
    React.Fragment,
    null,
    React.createElement(Composition, { id: 'FurusatoV2', component: OneMoneyTwoTimes, width: 1920, height: 1080, fps: 30, durationInFrames: V2_DURATION }),
    React.createElement(Composition, { id: 'HandRef', component: HandRef, width: 1600, height: 600, fps: 30, durationInFrames: 1 }),
    React.createElement(Composition, { id: 'HandTest', component: HandTest, width: 2400, height: 1100, fps: 30, durationInFrames: 1 }),
    React.createElement(Composition, { id: 'CharacterSheet', component: CharacterSheet, width: 1920, height: 1080, fps: 30, durationInFrames: 1 }),
  ),
);
