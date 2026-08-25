import { useState } from "react";
import { ArticleCard } from "./components/ArticleCard/ArticleCard";
import { Modal } from "./components/Modal/Modal";
import { Skeleton } from "./components/Skeleton/Skeleton";
import { useArticleFeed } from "./hooks/useArticleFeed";
import type { Article } from "./lib/wikipedia";

export function App() {
  const { articles, observeCard, isFetchingMore } = useArticleFeed();
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const openArticle = (article: Article) => {
    setIframeLoaded(false);
    setSelectedArticle(article);
  };

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
          <ArticleCard
            key={article.id}
            article={article}
            index={index}
            refCallback={observeCard}
            onOpen={() => openArticle(article)}
          />
        ))}
        {isFetchingMore && (
          <div className="flex justify-center py-4">
            <div className="h-6 w-6 rounded-full border-2 border-border border-t-primary animate-spin" />
          </div>
        )}
      </div>

      <Modal
        open={selectedArticle !== null}
        onOpenChange={(open) => !open && setSelectedArticle(null)}
        size="lg"
      >
        {selectedArticle && (
          <>
            <Modal.Header>
              <Modal.Title>{selectedArticle.title}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-0 relative overflow-hidden">
              {!iframeLoaded && <Skeleton shape="rect" className="absolute inset-0 rounded-none" />}
              <iframe
                key={selectedArticle.id}
                src={selectedArticle.pageUrl}
                title={selectedArticle.title}
                className="absolute top-0 left-0 h-1/2 w-1/2 origin-top-left scale-[2]"
                onLoad={() => setIframeLoaded(true)}
              />
            </Modal.Body>
            <Modal.Footer>
              <a
                href={selectedArticle.pageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Open in Wikipedia ↗
              </a>
            </Modal.Footer>
          </>
        )}
      </Modal>
    </div>
  );
}
