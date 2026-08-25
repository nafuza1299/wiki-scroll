import type { Article } from "../../lib/wikipedia";

const viewFormatter = new Intl.NumberFormat("en-US", { notation: "compact" });
const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export interface ArticleCardProps {
  article: Article;
  refCallback: (node: HTMLElement | null) => void;
  index: number;
}

export function ArticleCard({ article, refCallback, index }: ArticleCardProps) {
  return (
    <section
      ref={refCallback}
      data-index={index}
      className="rounded-2xl border border-border overflow-hidden bg-bg text-text"
    >
      <div className="h-44 w-full flex items-center justify-center bg-surface">
        {article.thumbnailUrl ? (
          <img
            src={article.thumbnailUrl}
            alt={article.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-4xl font-bold text-text-muted">W</span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1">
        <h2 className="text-base font-bold">
          <a href={article.pageUrl} target="_blank" rel="noreferrer" className="hover:underline">
            {article.title}
          </a>
        </h2>
        <p className="text-sm text-text-muted line-clamp-2">{article.extract}</p>
        <div className="flex gap-3 text-xs text-text-muted">
          <span>
            {article.viewCount30d !== null
              ? `${viewFormatter.format(article.viewCount30d)} views / 30d`
              : "views unavailable"}
          </span>
          <span>Edited {dateFormatter.format(new Date(article.lastEdited))}</span>
        </div>
      </div>
    </section>
  );
}
