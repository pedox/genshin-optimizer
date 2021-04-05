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
  const prunedArtifacts = Object.fromEntries(Object.entries(splitArtifacts).map(([key, values]) =>
    [key, pruneArtifacts(values, artifactSetEffects, new Set(dependencies), ascending)]))
  let { initialStats, formula } = PreprocessFormulas(dependencies, stats)
  let builds = [], threshold = -Infinity

  const prune = () => {
    builds.sort((a, b) => (b.buildFilterVal - a.buildFilterVal))
    builds.splice(maxBuildsToShow)
  }

  const oldCount = calculateTotalBuildNumber(splitArtifacts, setFilters)
  const newCount = calculateTotalBuildNumber(prunedArtifacts, setFilters)
  let buildCount = oldCount - newCount;

  if (process.env.NODE_ENV === "development")
    console.log(`Skipped ${Math.round(buildCount/1000000)}M entries out of ${Math.round(oldCount/1000000)}M, ${Math.round(newCount/1000000)}M remaining.`)

  const callback = (accu, stats) => {
    if (!(buildCount++ % 10000)) postMessage({ progress: buildCount, timing: performance.now() - t1 })
    formula(stats)
    if (Object.entries(minFilters).some(([key, minimum]) => stats[key] < minimum)) return
    if (Object.entries(maxFilters).some(([key, maximum]) => stats[key] > maximum)) return
    let buildFilterVal = ascending ? -target(stats) : target(stats)
    if (buildFilterVal >= threshold) {
      builds.push({ buildFilterVal, artifacts: { ...accu } })
      if (builds.length >= 1000) {
        prune()
        threshold = builds[builds.length - 1].buildFilterVal
      }
    }
  }
  for (const artifactsBySlot of artifactSetPermutations(prunedArtifacts, setFilters))
    artifactPermutations(initialStats, artifactsBySlot, artifactSetEffects, callback)

  prune()

  let t2 = performance.now()
  postMessage({ progress: buildCount, timing: t2 - t1 })
  postMessage({ builds, timing: t2 - t1 })
}
