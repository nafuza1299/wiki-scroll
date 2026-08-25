import { ArticleCard } from "./components/ArticleCard/ArticleCard";
import { Skeleton } from "./components/Skeleton/Skeleton";
import { useArticleFeed } from "./hooks/useArticleFeed";

export function App() {
  const { articles, observeCard, isFetchingMore } = useArticleFeed();

  if (articles.length === 0) {
    return (
      <div className="max-w-xl mx-auto flex flex-col gap-3 p-4">
        <Skeleton shape="rect" className="h-44 w-full rounded-2xl" />
        <Skeleton shape="text" className="w-3/4" />
        <Skeleton shape="text" className="w-1/2" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-y-auto">
      <div className="max-w-xl mx-auto flex flex-col gap-3 p-4">
        {articles.map((article, index) => (
          <ArticleCard key={article.id} article={article} index={index} refCallback={observeCard} />
        ))}
        {isFetchingMore && (
          <div className="flex justify-center py-4">
            <div className="h-6 w-6 rounded-full border-2 border-border border-t-primary animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
