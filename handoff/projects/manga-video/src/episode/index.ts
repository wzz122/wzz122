// 税务图解整期：npx remotion render src/episode/index.ts Episode out/furusato.mp4 --props='{"episode":"furusato"}'
import React from 'react';
import { Composition, registerRoot, staticFile } from 'remotion';
import { EpisodeVideo, type EpisodeTL } from './EpisodeVideo';

type Props = { episode: string; timeline?: EpisodeTL };

registerRoot(() =>
  React.createElement(Composition, {
    id: 'Episode', component: EpisodeVideo as any, width: 1920, height: 1080, fps: 30, durationInFrames: 300,
    defaultProps: { episode: 'furusato' } as Props,
    calculateMetadata: (async ({ props }: { props: Props }) => {
      const timeline = (await (await fetch(staticFile(`episodes/${props.episode}/timeline.json`))).json()) as EpisodeTL;
      return { durationInFrames: timeline.durationInFrames, props: { ...props, timeline } };
    }) as any,
  }),
);
