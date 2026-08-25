import { useEffect, useRef, useState } from "react";
import { fetchBatch, type Article } from "../lib/wikipedia";

const BATCH_SIZE = 10;

export function useArticleFeed() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const batchInFlight = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    batchInFlight.current = true;
    fetchBatch(BATCH_SIZE).then((batch) => {
      setArticles(batch);
      batchInFlight.current = false;
    });
  }, []);

  useEffect(() => {
    if (articles.length === 0 || batchInFlight.current) return;
    if (currentIndex === articles.length - 1) {
      batchInFlight.current = true;
      setIsFetchingMore(true);
      fetchBatch(BATCH_SIZE).then((batch) => {
        setArticles((prev) => [...prev, ...batch]);
        batchInFlight.current = false;
        setIsFetchingMore(false);
      });
    }
  }, [currentIndex, articles.length]);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            setCurrentIndex(index);
          }
        }
      },
      { threshold: 0.5 },
    );
    return () => observerRef.current?.disconnect();
  }, []);

  const observeCard = (node: HTMLElement | null) => {
    if (node) observerRef.current?.observe(node);
  };

  return { articles, observeCard, isFetchingMore };
}
