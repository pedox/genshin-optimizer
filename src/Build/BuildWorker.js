import '../WorkerHack'
import { PreprocessFormulas } from "../StatData";
import { artifactSetPermutations, artifactPermutations, pruneArtifacts, calculateTotalBuildNumber } from "./Build"
import charFormulas from "../Data/Characters/formula"
import { GetDependencies } from '../StatDependency';

onmessage = async (e) => {
  const t1 = performance.now()
  const { splitArtifacts, setFilters, minFilters = {}, maxFilters = {}, initialStats: stats, artifactSetEffects, maxBuildsToShow, optimizationTarget, ascending } = e.data;

  let target, targetKeys;
  if (typeof optimizationTarget === "string") {
    target = (stats) => stats[optimizationTarget]
    targetKeys = [optimizationTarget]
  } else {
    const { talentKey, formulaKey } = optimizationTarget
    const targetFormula = charFormulas?.[stats.characterKey]?.[talentKey]?.[formulaKey]
    if (typeof targetFormula === "function")
      [target, targetKeys] = targetFormula(stats)
    else {
      postMessage({ progress: 0, timing: 0 })
      postMessage({ builds: [], timing: 0 })
      return
    }
    if (targetKeys.length === 1) {
      // CAUTION: This optimization works only with monotonic dependencies
      const key = targetKeys[0]
      target = (stats) => stats[key]
    }
  }

  const dependencies = GetDependencies(stats.modifiers, [...targetKeys, ...Object.keys(minFilters), ...Object.keys(maxFilters)])
  const oldCount = calculateTotalBuildNumber(splitArtifacts, setFilters)

  const prune = (alwaysAccepted) => (Object.keys(ascending ? minFilters : maxFilters).length !== 0) ? splitArtifacts :
    Object.fromEntries(Object.entries(splitArtifacts).map(([key, values]) =>
      [key, pruneArtifacts(values, artifactSetEffects, new Set(dependencies), ascending, new Set(alwaysAccepted))]))

  let prunedArtifacts = prune([])
  let newCount = calculateTotalBuildNumber(prunedArtifacts, setFilters)
  if (newCount < maxBuildsToShow) {
    // over-pruned, try not to prune the set-filter
    prunedArtifacts = prune(setFilters.map(set => set.key))
    newCount = calculateTotalBuildNumber(prunedArtifacts, setFilters)
  }
  if (newCount < maxBuildsToShow) {
    // still not enough... let's just not prune it
    prunedArtifacts = splitArtifacts
    newCount = oldCount
  }

  let { initialStats, formula } = PreprocessFormulas(dependencies, stats)
  let builds = [], threshold = -Infinity
  let buildCount = oldCount - newCount;

  const gc = () => {
    builds.sort((a, b) => (b.buildFilterVal - a.buildFilterVal))
    builds.splice(maxBuildsToShow)
  }

  const callback = (accu, stats) => {
    if (!(buildCount++ % 10000)) postMessage({ progress: buildCount, timing: performance.now() - t1 })
    formula(stats)
    if (Object.entries(minFilters).some(([key, minimum]) => stats[key] < minimum)) return
    if (Object.entries(maxFilters).some(([key, maximum]) => stats[key] > maximum)) return
    let buildFilterVal = ascending ? -target(stats) : target(stats)
    if (buildFilterVal >= threshold) {
      builds.push({ buildFilterVal, artifacts: { ...accu } })
      if (builds.length >= 1000) {
        gc()
        threshold = builds[builds.length - 1].buildFilterVal
      }
    }
  }
  for (const artifactsBySlot of artifactSetPermutations(prunedArtifacts, setFilters))
    artifactPermutations(initialStats, artifactsBySlot, artifactSetEffects, callback)

  gc()

  let t2 = performance.now()
  postMessage({ progress: buildCount, timing: t2 - t1 })
  postMessage({ builds, timing: t2 - t1 })
}
