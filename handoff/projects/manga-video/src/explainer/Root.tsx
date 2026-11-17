import React from 'react';
import { Composition, staticFile } from 'remotion';
import { ExplainerVideo } from './ExplainerVideo';
import { galleryTimeline } from './gallery';
import type { Timeline } from './types';

type Props = { episode: string; timeline?: Timeline };

export const ExplainerCompositions: React.FC = () => (
  <>
    <Composition
      id="ExplainerVideo"
      component={ExplainerVideo}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={300}
      defaultProps={{ episode: 'pilot-explainer' } as Props}
      calculateMetadata={async ({ props }) => {
        const res = await fetch(staticFile(`episodes/${props.episode}/timeline.json`));
        const timeline = (await res.json()) as Timeline;
        return { durationInFrames: timeline.durationInFrames, props: { ...props, timeline } };
      }}
    />
    {/* 组件自测：11 个组件各放 3 秒，不用配音 */}
    <Composition
      id="ExplainerGallery"
      component={ExplainerVideo}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={galleryTimeline.durationInFrames}
      defaultProps={{ episode: 'gallery', timeline: galleryTimeline } as Props}
    />
  </>
);
