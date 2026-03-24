/*
  Custom hook encapsulating all state management for the SEP Lookup Tool.
  Supports two entry flows: zip search and state map click.
*/

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { getStateFromZip, getCarriersForZip } from "../lib/sepGeo";
import { fetchLiveFemaDisasters } from "../lib/sepFema";
import { fetchBulletins } from "../lib/sepBulletins";
import { fetchLiveNews } from "../lib/sepLiveNews";
import { fetchCountiesForState, fetchPlansFromSupabase, fetchCountyPlanCounts, transformCmsPlan } from "../lib/sepCms";
import { getCountyFromZip, getPlansForState } from "../data/sepPlanDb";
import { getSEPsForZip, getSEPsForState } from "../lib/sepEngine";

export function useSEPLookup() {
  const [zip, setZip] = useState("");
  const [searchedZip, setSearchedZip] = useState(null);
  const [selectedState, setSelectedState] = useState(null);
  const [results, setResults] = useState(null);
  const [carriers, setCarriers] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const [plans, setPlans] = useState(null);
  const [activeTab, setActiveTab] = useState("plans");
  const [expandedPlans, setExpandedPlans] = useState({});
  const [planFilterCarrier, setPlanFilterCarrier] = useState("all");
  const [planFilterType, setPlanFilterType] = useState("all");
  const [planFilterSnp, setPlanFilterSnp] = useState("all");
  const [planSearch, setPlanSearch] = useState("");
  const [selectedCounty, setSelectedCounty] = useState(null);
  const [countyList, setCountyList] = useState([]);
  const [countyLoading, setCountyLoading] = useState(false);
  const [countyPlanCounts, setCountyPlanCounts] = useState({});
  const [femaSource, setFemaSource] = useState("unknown");
  const [femaDisasters, setFemaDisasters] = useState([]);
  const [bulletins, setBulletins] = useState([]);
  const [liveNews, setLiveNews] = useState([]);
  const femaCache = useRef({ data: null, fetchedAt: 0 });
  const countyCache = useRef({});

  const loadTopFeed = useCallback(async () => {
    const [r, b, n] = await Promise.all([
      fetchLiveFemaDisasters(),
      fetchBulletins(),
      fetchLiveNews(),
    ]);
    femaCache.current = {
      data: r.disasters,
      fetchedAt: Date.now(),
      apiFailed: r.apiFailed,
    };
    return {
      disasters: r.disasters,
      source: r.apiFailed ? "fallback" : "live",
      bulletins: b,
      liveNews: n,
    };
  }, []);

  // Fetch FEMA data + bulletins on mount and refresh periodically so the feed stays current.
  useEffect(() => {
    let cancelled = false;

    const syncTopFeed = async () => {
      try {
        const next = await loadTopFeed();
        if (cancelled) return;
        setFemaDisasters(next.disasters);
        setFemaSource(next.source);
        setBulletins(next.bulletins);
        setLiveNews(next.liveNews);
      } catch (err) {
        console.error("Top feed refresh error:", err);
      }
    };

    syncTopFeed();

    const intervalId = window.setInterval(syncTopFeed, 6 * 60 * 60 * 1000);
    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        syncTopFeed();
      }
    };

    window.addEventListener("focus", handleVisibilityRefresh);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
    };
  }, [loadTopFeed]);

  const loadPlansForCounty = useCallback(async (st, county) => {
    if (!st || !county) return;
    setCountyLoading(true);
    try {
      const cmsRows = await fetchPlansFromSupabase(st, county);
      const seen = new Set();
      const transformed = [];
      for (const row of cmsRows) {
        const key = `${row["Contract ID"]}-${row["Plan ID"]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        transformed.push(transformCmsPlan(row));
      }
      transformed.sort((a, b) => {
        if ((b.stars || 0) !== (a.stars || 0)) return (b.stars || 0) - (a.stars || 0);
        if (a.prem !== b.prem) return a.prem - b.prem;
        return a.name.localeCompare(b.name);
      });
      setPlans(transformed);
    } catch (err) {
      console.error("Supabase plan fetch error:", err);
      setPlans(getPlansForState(st));
    } finally {
      setCountyLoading(false);
    }
  }, []);

  /* ── State map click entry ── */
  const handleStateClick = useCallback(async (stateCode) => {
    setSelectedState(stateCode);
    setSelectedCounty(null);
    setPlans(null);
    setResults(null);
    setSearchedZip(null);
    setCarriers([]);
    setExpanded({});
    setExpandedPlans({});
    setFilterCategory("all");
    setFilterProduct("all");
    setPlanFilterCarrier("all");
    setPlanFilterType("all");
    setPlanFilterSnp("all");
    setPlanSearch("");
    setActiveTab("plans");

    if (!stateCode) {
      setCountyList([]);
      setCountyPlanCounts({});
      return;
    }

    setCountyLoading(true);
    try {
      // Fetch FEMA + SEPs for this state
      let femaData = femaCache.current.data;
      const now = Date.now();
      if (!femaData || now - femaCache.current.fetchedAt > 30 * 60 * 1000) {
        const r = await fetchLiveFemaDisasters();
        femaData = r.disasters;
        femaCache.current = { data: femaData, fetchedAt: now, apiFailed: r.apiFailed };
        setFemaSource(r.apiFailed ? "fallback" : "live");
      } else {
        setFemaSource(femaCache.current.apiFailed ? "fallback" : "live");
      }
      setFemaDisasters(femaData);
      const seps = getSEPsForState(stateCode, femaData);
      setResults(seps);

      // Fetch counties (use cache if available)
      let counties, counts;
      if (countyCache.current[stateCode]) {
        counties = countyCache.current[stateCode].counties;
        counts = countyCache.current[stateCode].counts;
      } else {
        [counties, counts] = await Promise.all([
          fetchCountiesForState(stateCode),
          fetchCountyPlanCounts(stateCode),
        ]);
        countyCache.current[stateCode] = { counties, counts };
      }
      setCountyList(counties);
      setCountyPlanCounts(counts);
    } catch (err) {
      console.error("State click error:", err);
      setCountyList([]);
      setCountyPlanCounts({});
    } finally {
      setCountyLoading(false);
    }
  }, []);

  /* ── Zip search entry ── */
  const handleSearch = useCallback(async () => {
    const cleanZip = zip.trim();
    if (!/^\d{5}$/.test(cleanZip)) return;
    setLoading(true);
    try {
      let femaData = femaCache.current.data;
      const now = Date.now();
      if (!femaData || now - femaCache.current.fetchedAt > 30 * 60 * 1000) {
        const r = await fetchLiveFemaDisasters();
        femaData = r.disasters;
        femaCache.current = { data: femaData, fetchedAt: now, apiFailed: r.apiFailed };
        setFemaSource(r.apiFailed ? "fallback" : "live");
      } else {
        setFemaSource(femaCache.current.apiFailed ? "fallback" : "live");
      }
      setFemaDisasters(femaData);
      const st = getStateFromZip(cleanZip);
      const seps = getSEPsForZip(cleanZip, femaData);
      const zipCarriers = getCarriersForZip(cleanZip);
      setResults(seps);
      setCarriers(zipCarriers);
      setSearchedZip(cleanZip);
      setSelectedState(st);
      setExpanded({});
      setExpandedPlans({});
      setFilterCategory("all");
      setFilterProduct("all");
      setPlanFilterCarrier("all");
      setPlanFilterType("all");
      setPlanFilterSnp("all");
      setPlanSearch("");

      const autoCounty = getCountyFromZip(cleanZip);

      // Load counties + counts (use cache if available)
      let counties, counts;
      if (countyCache.current[st]) {
        counties = countyCache.current[st].counties;
        counts = countyCache.current[st].counts;
      } else {
        [counties, counts] = await Promise.all([
          fetchCountiesForState(st),
          fetchCountyPlanCounts(st),
        ]);
        countyCache.current[st] = { counties, counts };
      }
      setCountyList(counties);
      setCountyPlanCounts(counts);

      if (autoCounty && counties.includes(autoCounty)) {
        setSelectedCounty(autoCounty);
        await loadPlansForCounty(st, autoCounty);
      } else if (counties.length > 0) {
        setSelectedCounty(null);
        setPlans([]);
      } else {
        setSelectedCounty(null);
        setPlans(getPlansForState(cleanZip));
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  }, [zip, loadPlansForCounty]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  const isValidZip = /^\d{5}$/.test(zip.trim());
  const state = selectedState || (searchedZip ? getStateFromZip(searchedZip) : "");

  const filtered = results?.filter((s) => {
    if (filterCategory !== "all" && s.category !== filterCategory) return false;
    if (filterProduct !== "all" && !s.eligibleProducts.includes(filterProduct)) return false;
    return true;
  });

  const femaActive = filtered?.filter((s) => s.category === "FEMA Disaster") || [];
  const allProducts = [...new Set((results || []).flatMap((s) => s.eligibleProducts))].sort();
  const allCategories = [...new Set((results || []).map((s) => s.category))];

  const filteredPlans = useMemo(() => {
    if (!plans) return [];
    return plans.filter((p) => {
      if (planFilterCarrier !== "all" && p.carrier !== planFilterCarrier) return false;
      if (planFilterType !== "all" && p.type !== planFilterType) return false;
      if (planFilterSnp !== "all") {
        if (planFilterSnp === "none" ? p.snp : p.snp !== planFilterSnp) return false;
      }
      if (planSearch) {
        const q = planSearch.toLowerCase();
        if (!`${p.name} ${p.cid} ${p.pbp} ${p.carrier} ${p.type} ${p.snp || ""}`.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [plans, planFilterCarrier, planFilterType, planFilterSnp, planSearch]);

  const planCarrierOpts = useMemo(
    () => [...new Set((plans || []).map((p) => p.carrier))].sort(),
    [plans]
  );
  const planTypeOpts = useMemo(
    () => [...new Set((plans || []).map((p) => p.type))].sort(),
    [plans]
  );

  /* Whether we have any view to show (state selected OR zip searched) */
  const hasView = !!(selectedState || results);

  return {
    zip, setZip, searchedZip, results, carriers, loading,
    expanded, setExpanded, filterCategory, setFilterCategory,
    filterProduct, setFilterProduct, activeTab, setActiveTab,
    plans, expandedPlans, setExpandedPlans,
    planFilterCarrier, setPlanFilterCarrier,
    planFilterType, setPlanFilterType,
    planFilterSnp, setPlanFilterSnp,
    planSearch, setPlanSearch,
    selectedCounty, setSelectedCounty, countyList,
    countyLoading, countyPlanCounts, femaSource, femaDisasters, bulletins, liveNews, inputRef,
    handleSearch, handleKeyDown, handleStateClick, loadPlansForCounty,
    isValidZip, filtered, femaActive, state,
    selectedState, setSelectedState,
    allProducts, allCategories, filteredPlans,
    planCarrierOpts, planTypeOpts, hasView,
  };
}
