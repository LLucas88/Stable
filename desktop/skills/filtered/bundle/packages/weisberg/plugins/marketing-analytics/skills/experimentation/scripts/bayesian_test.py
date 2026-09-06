"""Bayesian A/B test analysis."""

from __future__ import annotations

import random
import statistics
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple


def _quantile(values: Sequence[float], q: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * q
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    fraction = position - low
    return ordered[low] + (ordered[high] - ordered[low]) * fraction


@dataclass
class BetaPosterior:
    alpha: float
    beta: float
    mean: float
    variance: float
    credible_interval_95: Tuple[float, float]


@dataclass
class NormalInverseGammaPosterior:
    mu: float
    nu: float
    alpha: float
    beta: float
    mean: float
    credible_interval_95: Tuple[float, float]


@dataclass
class BayesianResult:
    metric_name: str
    variant_posteriors: Dict[str, BetaPosterior | NormalInverseGammaPosterior]
    prob_being_best: Dict[str, float]
    expected_loss: Dict[str, float]
    lift_distribution_summary: Dict[str, float]
    credible_interval_lift: Tuple[float, float]
    risk_reward: Tuple[float, float]


def compute_beta_posterior(
    successes: int,
    total: int,
    prior_alpha: float = 1.0,
    prior_beta: float = 1.0,
) -> BetaPosterior:
    if total < 0 or successes < 0 or successes > total:
        raise ValueError("successes must be between 0 and total")
    if prior_alpha <= 0 or prior_beta <= 0:
        raise ValueError("prior parameters must be positive")
    alpha_post = prior_alpha + successes
    beta_post = prior_beta + (total - successes)
    mean = alpha_post / (alpha_post + beta_post)
    variance = (alpha_post * beta_post) / (((alpha_post + beta_post) ** 2) * (alpha_post + beta_post + 1))
    rng = random.Random(11)
    samples = [rng.betavariate(alpha_post, beta_post) for _ in range(5000)]
    return BetaPosterior(
        alpha=alpha_post,
        beta=beta_post,
        mean=mean,
        variance=variance,
        credible_interval_95=(_quantile(samples, 0.025), _quantile(samples, 0.975)),
    )


def compute_nig_posterior(
    values: Sequence[float],
    prior_mu: float = 0.0,
    prior_nu: float = 0.01,
    prior_alpha: float = 0.01,
    prior_beta: float = 0.01,
) -> NormalInverseGammaPosterior:
    observations = [float(value) for value in values]
    if not observations:
        raise ValueError("values must be non-empty")
    if min(prior_nu, prior_alpha, prior_beta) <= 0:
        raise ValueError("prior parameters must be positive")
    n = len(observations)
    mean_value = statistics.fmean(observations)
    ss = sum((value - mean_value) ** 2 for value in observations)
    nu_n = prior_nu + n
    mu_n = (prior_nu * prior_mu + n * mean_value) / nu_n
    alpha_n = prior_alpha + (n / 2)
    beta_n = prior_beta + 0.5 * ss + ((n * prior_nu * (mean_value - prior_mu) ** 2) / (2 * nu_n))

    rng = random.Random(17)
    draws = []
    for _ in range(5000):
        precision = rng.gammavariate(alpha_n, 1 / beta_n)
        variance = 1 / max(precision, 1e-12)
        mean_draw = rng.gauss(mu_n, (variance / nu_n) ** 0.5)
        draws.append(mean_draw)
    return NormalInverseGammaPosterior(
        mu=mu_n,
        nu=nu_n,
        alpha=alpha_n,
        beta=beta_n,
        mean=statistics.fmean(draws),
        credible_interval_95=(_quantile(draws, 0.025), _quantile(draws, 0.975)),
    )


def _sample_posterior(
    posterior: BetaPosterior | NormalInverseGammaPosterior,
    rng: random.Random,
    n_simulations: int,
) -> list[float]:
    if isinstance(posterior, BetaPosterior):
        return [rng.betavariate(posterior.alpha, posterior.beta) for _ in range(n_simulations)]
    draws = []
    for _ in range(n_simulations):
        precision = rng.gammavariate(posterior.alpha, 1 / posterior.beta)
        variance = 1 / max(precision, 1e-12)
        draws.append(rng.gauss(posterior.mu, (variance / posterior.nu) ** 0.5))
    return draws


def probability_of_being_best(
    posteriors: Dict[str, BetaPosterior | NormalInverseGammaPosterior],
    n_simulations: int = 100_000,
    random_seed: int = 42,
) -> Dict[str, float]:
    rng = random.Random(random_seed)
    samples = {name: _sample_posterior(posterior, rng, n_simulations) for name, posterior in posteriors.items()}
    wins = {name: 0 for name in posteriors}
    names = list(posteriors.keys())
    for index in range(n_simulations):
        best_name = max(names, key=lambda name: samples[name][index])
        wins[best_name] += 1
    return {name: wins[name] / n_simulations for name in names}


def expected_loss(
    posteriors: Dict[str, BetaPosterior | NormalInverseGammaPosterior],
    n_simulations: int = 100_000,
    random_seed: int = 42,
) -> Dict[str, float]:
    rng = random.Random(random_seed)
    samples = {name: _sample_posterior(posterior, rng, n_simulations) for name, posterior in posteriors.items()}
    losses: dict[str, float] = {}
    names = list(posteriors.keys())
    for name in names:
        per_sim_losses = []
        for index in range(n_simulations):
            current = samples[name][index]
            best_other = max(samples[other][index] for other in names if other != name)
            per_sim_losses.append(max(best_other - current, 0.0))
        losses[name] = statistics.fmean(per_sim_losses)
    return losses


def compute_lift_distribution(
    control_posterior: BetaPosterior | NormalInverseGammaPosterior,
    treatment_posterior: BetaPosterior | NormalInverseGammaPosterior,
    n_simulations: int = 100_000,
    random_seed: int = 42,
) -> Dict[str, float]:
    rng = random.Random(random_seed)
    control_samples = _sample_posterior(control_posterior, rng, n_simulations)
    treatment_samples = _sample_posterior(treatment_posterior, rng, n_simulations)
    lifts = []
    for control, treatment in zip(control_samples, treatment_samples):
        denominator = control if abs(control) > 1e-9 else 1e-9
        lifts.append((treatment - control) / denominator)
    return {
        "mean": statistics.fmean(lifts),
        "median": statistics.median(lifts),
        "std": statistics.pstdev(lifts) if len(lifts) > 1 else 0.0,
        "p5": _quantile(lifts, 0.05),
        "p25": _quantile(lifts, 0.25),
        "p75": _quantile(lifts, 0.75),
        "p95": _quantile(lifts, 0.95),
    }


def run_bayesian_analysis(
    experiment_data: Dict[str, Dict[str, Sequence[float]]],
    metric_types: Dict[str, str],
    priors: Optional[Dict[str, Dict]] = None,
    n_simulations: int = 100_000,
    random_seed: int = 42,
) -> List[BayesianResult]:
    priors = priors or {}
    results: list[BayesianResult] = []
    for metric_name, variants in experiment_data.items():
        metric_type = metric_types.get(metric_name, "continuous")
        variant_posteriors: dict[str, BetaPosterior | NormalInverseGammaPosterior] = {}
        for variant_name, values in variants.items():
            variant_prior = priors.get(metric_name, {})
            if metric_type == "proportion":
                successes = sum(1 for value in values if float(value) > 0)
                variant_posteriors[variant_name] = compute_beta_posterior(
                    successes,
                    len(values),
                    prior_alpha=float(variant_prior.get("prior_alpha", 1.0)),
                    prior_beta=float(variant_prior.get("prior_beta", 1.0)),
                )
            else:
                variant_posteriors[variant_name] = compute_nig_posterior(
                    values,
                    prior_mu=float(variant_prior.get("prior_mu", 0.0)),
                    prior_nu=float(variant_prior.get("prior_nu", 0.01)),
                    prior_alpha=float(variant_prior.get("prior_alpha", 0.01)),
                    prior_beta=float(variant_prior.get("prior_beta", 0.01)),
                )

        probabilities = probability_of_being_best(
            variant_posteriors, n_simulations=n_simulations, random_seed=random_seed
        )
        losses = expected_loss(variant_posteriors, n_simulations=n_simulations, random_seed=random_seed)
        control_posterior = variant_posteriors.get("control")
        treatment_posterior = variant_posteriors.get("treatment")
        if control_posterior is None or treatment_posterior is None:
            continue
        lift_summary = compute_lift_distribution(
            control_posterior,
            treatment_posterior,
            n_simulations=n_simulations,
            random_seed=random_seed,
        )
        ci = (lift_summary["p5"], lift_summary["p95"])
        risk_reward = (
            max(lift_summary["p95"], 0.0),
            abs(min(lift_summary["p5"], 0.0)),
        )
        results.append(
            BayesianResult(
                metric_name=metric_name,
                variant_posteriors=variant_posteriors,
                prob_being_best=probabilities,
                expected_loss=losses,
                lift_distribution_summary=lift_summary,
                credible_interval_lift=ci,
                risk_reward=risk_reward,
            )
        )
    return results
