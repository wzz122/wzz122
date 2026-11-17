import { Composition, Folder } from "remotion";
import { ExplainerCompositions } from "./explainer/Root";
import { calculateMangaMetadata, MangaEpisode } from "./manga/MangaEpisode";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 漫画风对谈版：时长、尺寸由 build/<episode>/timeline.json 决定（calculateMetadata 读进来） */}
      <Folder name="Manga">
        <Composition
          id="MangaEpisode"
          component={MangaEpisode}
          durationInFrames={300}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{ episode: "pilot", plan: null }}
          calculateMetadata={calculateMangaMetadata}
        />
      </Folder>
      {/* 单人主讲图解版（由另一个会话维护，代码在 src/explainer/） */}
      <ExplainerCompositions />
    </>
  );
};
