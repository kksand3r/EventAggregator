"use client";

import {useState, useEffect} from "react";
import {fetchMetadata, type MetadataResponse} from "@/lib/api";

let cachedMetadataPromise: Promise<MetadataResponse> | null = null;

export function useMetadata() {
    const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        if (!cachedMetadataPromise) {
            cachedMetadataPromise = fetchMetadata();
        }

        cachedMetadataPromise
            .then(data => {
                if (!cancelled) {
                    setMetadata(data);
                    setLoading(false);
                }
            })
            .catch(error => {
                console.error("Failed to fetch metadata:", error);
                if (!cancelled) setLoading(false);
                cachedMetadataPromise = null;
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return {metadata, loading};
}