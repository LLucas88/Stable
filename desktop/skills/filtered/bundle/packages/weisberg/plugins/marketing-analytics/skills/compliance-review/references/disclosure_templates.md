# Disclosure Templates

**Reference Version:** 1.0
**Last Updated:** 2026-03-19

> These templates provide standard regulatory disclosure language. Firms should
> customize these templates with their specific approved language. The compliance-review
> skill uses these as defaults when firm-specific templates are not configured.
>
> This is reference material for an advisory first-pass review tool. All disclosures
> must be reviewed and approved by a qualified compliance officer before use.

## Performance Disclosures

### Past Performance Disclaimer (US -- SEC/FINRA)

```
Past performance is not indicative of future results. The investment return and
principal value of an investment will fluctuate so that an investor's shares, when
redeemed, may be worth more or less than their original cost. Current performance
may be lower or higher than the performance quoted.
```

### Past Performance Disclaimer (UK -- FCA)

```
Past performance is not a reliable indicator of future results. The value of
investments and the income from them can go down as well as up and you may not
get back the amount originally invested.
```

### Gross/Net Performance Disclosure

```
Gross performance results do not reflect the deduction of investment advisory fees.
Net performance results reflect the deduction of [actual/model] investment advisory
fees of [X]%. The client's actual return will be reduced by the advisory fees and
other expenses incurred in the management of the account. A description of the
adviser's fee schedule is available in Part 2A of Form ADV.
```

### Hypothetical Performance Disclaimer

```
HYPOTHETICAL PERFORMANCE RESULTS HAVE MANY INHERENT LIMITATIONS, SOME OF WHICH ARE
DESCRIBED BELOW. NO REPRESENTATION IS BEING MADE THAT ANY ACCOUNT WILL OR IS LIKELY
TO ACHIEVE PROFITS OR LOSSES SIMILAR TO THOSE SHOWN. IN FACT, THERE ARE FREQUENTLY
SHARP DIFFERENCES BETWEEN HYPOTHETICAL PERFORMANCE RESULTS AND THE ACTUAL RESULTS
SUBSEQUENTLY ACHIEVED BY ANY PARTICULAR TRADING PROGRAM.

ONE OF THE LIMITATIONS OF HYPOTHETICAL PERFORMANCE RESULTS IS THAT THEY ARE GENERALLY
PREPARED WITH THE BENEFIT OF HINDSIGHT. IN ADDITION, HYPOTHETICAL TRADING DOES NOT
INVOLVE FINANCIAL RISK, AND NO HYPOTHETICAL TRADING RECORD CAN COMPLETELY ACCOUNT FOR
THE IMPACT OF FINANCIAL RISK IN ACTUAL TRADING.
```

### Back-Tested Performance Disclaimer

```
Back-tested performance is hypothetical and has not been achieved by any client.
Back-tested results are calculated by retroactively applying a model with the benefit
of hindsight. Back-tested results do not represent actual trading and may not reflect
the impact of material economic and market factors on decision-making. Actual
performance may differ significantly from back-tested performance.
```

### Benchmark Disclosure

```
The [Benchmark Name] is shown for informational purposes only and is not meant to
represent the performance of any particular investment. The benchmark is unmanaged
and does not reflect the deduction of fees or expenses. Investors cannot invest
directly in an index. The adviser's investment strategy differs materially from the
composition of the benchmark.
```

### Time Period Disclosure

```
Performance shown is for the periods ending [Date]. Returns for periods greater than
one year are annualized. Returns for periods less than one year are not annualized.
```

## Risk Disclosures

### General Investment Risk (US)

```
Investing involves risk, including the possible loss of principal. There is no
guarantee that any investment strategy will achieve its objectives. Diversification
does not ensure a profit or protect against a loss in a declining market.
```

### General Investment Risk (UK)

```
Capital at risk. The value of investments and the income from them can fall as well
as rise and are not guaranteed. Investors may not get back the amount originally
invested.
```

### Specific Risk Factors Template

```
[Product/Strategy Name] involves the following risks: [list specific risks relevant
to the product, including but not limited to market risk, credit risk, liquidity
risk, interest rate risk, currency risk, concentration risk, leverage risk, and
counterparty risk].
```

### Leveraged Product Risk Warning

```
[Product Name] uses leverage, which magnifies both gains and losses. Leveraged
products are designed for short-term trading and may perform differently than
expected over longer periods due to the effects of daily rebalancing and compounding.
These products are not suitable for all investors.
```

## Fee Disclosures

### Advisory Fee Disclosure

```
[Firm Name] charges an advisory fee of [X]% per annum on assets under management.
Fees are [charged quarterly in advance/arrears]. Actual fees may vary. Please refer
to [Firm Name]'s Form ADV Part 2A for a complete description of advisory fees and
expenses.
```

### Total Cost Disclosure

```
The total cost of investing includes advisory fees, fund expenses, transaction costs,
and other charges. These costs reduce the net return on your investment. A complete
description of all fees and expenses is available in [document reference].
```

## Testimonial and Endorsement Disclosures

### Compensated Testimonial Disclosure

```
[Name/Description] is a [current client/investor] of [Firm Name] and was
[compensated $X / provided non-cash compensation in the form of (describe)] for
this testimonial. [Name/Description] has a [describe any material conflict of
interest]. The experience described may not be representative of the experience
of other clients. This testimonial is no guarantee of future performance or success.
```

### Uncompensated Testimonial Disclosure

```
[Name/Description] is a [current client/investor] of [Firm Name] and was not
compensated for this testimonial. The experience described may not be representative
of the experience of other clients. This testimonial is no guarantee of future
performance or success.
```

### Endorsement Disclosure

```
[Name/Description] is not a client of [Firm Name] and was [compensated $X / provided
non-cash compensation in the form of (describe)] for this endorsement.
[Name/Description] has a [describe any material conflict of interest]. This
endorsement is no guarantee of future performance or success.
```

## Third-Party Rating Disclosures

### Rating Disclosure

```
[Rating] was awarded by [Rating Organization] on [Date] for the period [Start Date]
to [End Date]. The rating is based on [brief methodology description]. [Firm Name]
[did/did not] pay a fee to [Rating Organization] to obtain or use this rating.
[Number] of [firms/products] were evaluated for this rating. The rating is not
indicative of the adviser's future performance.
```

## Regulatory Status Disclosures

### SEC-Registered Adviser

```
[Firm Name] is an investment adviser registered with the U.S. Securities and Exchange
Commission. Registration does not imply a certain level of skill or training.
```

### FINRA Broker-Dealer

```
[Firm Name] is a broker-dealer registered with the Financial Industry Regulatory
Authority (FINRA) and the Securities and Exchange Commission (SEC). Member FINRA/SIPC.
```

### FCA-Authorized Firm

```
[Firm Name] is authorised and regulated by the Financial Conduct Authority
(FRN: [number]). Registered in England and Wales, company number [number].
```

## Template Customization

Firms should replace bracketed placeholders with their specific information. To
customize templates for a specific firm:

1. Copy the relevant template(s) to a firm-specific override file.
2. Replace all bracketed values with firm-approved language.
3. Have the firm's compliance officer approve the customized templates.
4. Place the approved templates in `workspace/config/firm_disclosures.md`.
5. The disclosure_inserter script will use firm-specific templates when available,
   falling back to these defaults otherwise.
