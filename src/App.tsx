import { useMemo, useState } from 'react'
import './App.css'
import {
  addProfileAllocation,
  calculatePromotionActive,
  calculateOrganizationMetrics,
  createDivision,
  createProfile,
  defaultOrganizationSettings,
  distributeUsersBySplitPercents,
  removeProfileAllocation,
  type DivisionProfileAllocation,
  type Division,
  type ProfileId,
} from './lib/budget'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat('en-US')

const formatCurrency = (value: number) => currencyFormatter.format(value)
const formatNumber = (value: number) => numberFormatter.format(value)

const parseNumber = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits))
const roundWhole = (value: number) => Math.round(value)

const normalizeSplitPercents = (rawSplitPercents: number[], profileCount: number) => {
  if (profileCount <= 0) {
    return [] as number[]
  }

  if (profileCount === 1) {
    return [100]
  }

  const next = Array.from({ length: profileCount }, (_, index) =>
    round(Math.max(0, rawSplitPercents[index] ?? 0), 2),
  )

  const total = next.reduce((sum, percent) => sum + percent, 0)

  if (total <= 0) {
    const even = round(100 / profileCount, 2)
    return Array.from({ length: profileCount }, (_, index) =>
      index === profileCount - 1
        ? round(100 - even * (profileCount - 1), 2)
        : even,
    )
  }

  const scaled = next.map((percent) => round((percent / total) * 100, 2))
  const consumed = scaled.slice(0, -1).reduce((sum, percent) => sum + percent, 0)
  scaled[scaled.length - 1] = round(Math.max(100 - consumed, 0), 2)

  return scaled
}

const rebalanceSplitPercents = (
  currentSplitPercents: number[],
  changedIndex: number,
  nextPercentRaw: number,
) => {
  const profileCount = currentSplitPercents.length

  if (profileCount <= 0) {
    return [] as number[]
  }

  if (profileCount === 1) {
    return [100]
  }

  const nextPercent = round(Math.max(0, Math.min(nextPercentRaw, 100)), 2)
  const remainingTarget = round(100 - nextPercent, 2)

  const others = currentSplitPercents.map((percent, index) => ({
    percent,
    index,
  }))
  const otherProfiles = others.filter(({ index }) => index !== changedIndex)
  const otherTotal = otherProfiles.reduce((sum, entry) => sum + entry.percent, 0)

  const rebalanced = [...currentSplitPercents]
  rebalanced[changedIndex] = nextPercent

  if (otherProfiles.length === 0) {
    return [100]
  }

  if (otherTotal <= 0) {
    const even = round(remainingTarget / otherProfiles.length, 2)
    otherProfiles.forEach(({ index }, otherIndex) => {
      rebalanced[index] =
        otherIndex === otherProfiles.length - 1
          ? round(remainingTarget - even * (otherProfiles.length - 1), 2)
          : even
    })

    return rebalanced
  }

  let distributed = 0
  otherProfiles.forEach(({ percent, index }, otherIndex) => {
    if (otherIndex === otherProfiles.length - 1) {
      rebalanced[index] = round(Math.max(remainingTarget - distributed, 0), 2)
      return
    }

    const scaled = round((percent / otherTotal) * remainingTarget, 2)
    rebalanced[index] = scaled
    distributed = round(distributed + scaled, 2)
  })

  return rebalanced
}

const getTodayLocalInputValue = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

function App() {
  const [settings, setSettings] = useState(defaultOrganizationSettings)
  const [divisions, setDivisions] = useState<Division[]>([
    createDivision('Division 1', defaultOrganizationSettings.profiles),
  ])
  const [companyInfo, setCompanyInfo] = useState({
    companyName: '',
    budgetPreparedBy: '',
    budgetPreparedOn: getTodayLocalInputValue(),
    aboutBudget: '',
  })

  const totalUsers = useMemo(
    () =>
      divisions.reduce(
        (sum, division) =>
          sum +
          Object.values(division.allocations).reduce(
            (allocationSum, allocation) => allocationSum + allocation.users,
            0,
          ),
        0,
      ),
    [divisions],
  )

  const settingsWithDerivedUsers = useMemo(
    () => ({
      ...settings,
      totalUsers,
    }),
    [settings, totalUsers],
  )

  const promotionalActive = useMemo(
    () => calculatePromotionActive(companyInfo.budgetPreparedOn),
    [companyInfo.budgetPreparedOn],
  )

  const getEffectiveIncludedCredits = (profile: {
    includedCredits: number
    promotional: boolean
  }) =>
    promotionalActive && profile.promotional
      ? profile.includedCredits + Math.max(3000 - profile.includedCredits, 0)
      : profile.includedCredits

  const metrics = useMemo(
    () =>
      calculateOrganizationMetrics(
        divisions,
        settingsWithDerivedUsers,
        promotionalActive,
      ),
    [divisions, settingsWithDerivedUsers, promotionalActive],
  )

  const profileUserTotals = useMemo(() => {
    const getUsersForProfile = (profileId?: string) =>
      profileId
        ? divisions.reduce(
            (sum, division) => sum + (division.allocations[profileId]?.users ?? 0),
            0,
          )
        : 0

    const standardProfile = settings.profiles[0]
    const advancedProfile = settings.profiles[1]
    const additionalProfiles = settings.profiles.slice(2)

    return {
      standardUsers: getUsersForProfile(standardProfile?.id),
      advancedUsers: getUsersForProfile(advancedProfile?.id),
      additionalUsers: additionalProfiles.reduce(
        (sum, profile) => sum + getUsersForProfile(profile.id),
        0,
      ),
      profileUserBreakdown: settings.profiles
        .map((profile) => {
          const users = getUsersForProfile(profile.id)

          return `${profile.name}: ${formatNumber(users)}`
        })
        .join(', '),
    }
  }, [divisions, settings.profiles])

  const divisionMetricsById = new Map(
    metrics.divisions.map((division) => [division.id, division]),
  )

  const applyDivisionUsersBySplit = (
    division: Division,
    profiles = settings.profiles,
  ): Division => {
    const splitPercents = normalizeSplitPercents(
      division.userSplitPercents,
      profiles.length,
    )
    const distributedUsers = distributeUsersBySplitPercents(
      division.totalUsers,
      splitPercents,
    )

    const nextAllocations = Object.fromEntries(
      profiles.map((profile, index) => {
        const existingAllocation = division.allocations[profile.id] ?? {
          users: 0,
          budget: 19,
        }

        return [
          profile.id,
          {
            ...existingAllocation,
            users: distributedUsers[index] ?? 0,
          },
        ]
      }),
    ) as Record<ProfileId, DivisionProfileAllocation>

    return {
      ...division,
      totalUsers: Math.max(0, Math.floor(division.totalUsers)),
      userSplitPercents: splitPercents,
      allocations: nextAllocations,
    }
  }

  const updateProfile = (
    profileId: ProfileId,
    field: 'name' | 'monthlyPrice' | 'includedCredits' | 'promotional',
    value: string | boolean,
  ) => {
    setSettings((current) => ({
      ...current,
      profiles: current.profiles.map((profile) =>
        profile.id === profileId
          ? {
              ...profile,
              [field]:
                field === 'name'
                  ? value
                  : field === 'promotional'
                    ? Boolean(value)
                    : parseNumber(String(value)),
            }
          : profile,
      ),
    }))
  }

  const updateDivisionName = (divisionId: string, name: string) => {
    setDivisions((current) =>
      current.map((division) =>
        division.id === divisionId ? { ...division, name } : division,
      ),
    )
  }

  const updateDivisionAllocation = (
    divisionId: string,
    profileId: ProfileId,
    field: 'budget',
    value: string,
  ) => {
    setDivisions((current) =>
      current.map((division) =>
        division.id === divisionId
          ? {
              ...division,
              allocations: {
                ...division.allocations,
                [profileId]: {
                  ...division.allocations[profileId],
                  [field]: parseNumber(value),
                },
              },
            }
          : division,
      ),
    )
  }

  const updateDivisionTotalUsers = (divisionId: string, value: string) => {
    const parsedUsers = parseNumber(value)

    setDivisions((current) =>
      current.map((division) =>
        division.id === divisionId
          ? applyDivisionUsersBySplit({
              ...division,
              totalUsers: parsedUsers,
            })
          : division,
      ),
    )
  }

  const updateDivisionSplit = (
    divisionId: string,
    profileIndex: number,
    value: string,
  ) => {
    const parsedPercent = roundWhole(parseNumber(value))

    setDivisions((current) =>
      current.map((division) => {
        if (division.id !== divisionId) {
          return division
        }

        const currentSplitPercents = normalizeSplitPercents(
          division.userSplitPercents,
          settings.profiles.length,
        )
        const nextSplitPercents = rebalanceSplitPercents(
          currentSplitPercents,
          profileIndex,
          parsedPercent,
        )

        return applyDivisionUsersBySplit({
          ...division,
          userSplitPercents: nextSplitPercents,
        })
      }),
    )
  }

  const addDivision = () => {
    setDivisions((current) => [
      ...current,
      createDivision(`Division ${current.length + 1}`, settings.profiles),
    ])
  }

  const removeDivision = (divisionId: string) => {
    setDivisions((current) =>
      current.filter((division) => division.id !== divisionId),
    )
  }

  const addProfile = () => {
    const nextProfile = createProfile(
      `Profile ${settings.profiles.length + 1}`,
      19,
      1900,
    )
    const nextProfiles = [...settings.profiles, nextProfile]

    setSettings((current) => ({
      ...current,
      profiles: [...current.profiles, nextProfile],
    }))
    setDivisions((current) =>
      current.map((division) =>
        applyDivisionUsersBySplit(
          addProfileAllocation(division, nextProfile.id, nextProfiles.length),
          nextProfiles,
        ),
      ),
    )
  }

  const removeProfile = (profileId: ProfileId) => {
    const removedProfileIndex = settings.profiles.findIndex(
      (profile) => profile.id === profileId,
    )
    const nextProfiles = settings.profiles.filter(
      (profile) => profile.id !== profileId,
    )

    setSettings((current) => ({
      ...current,
      profiles: current.profiles.filter((profile) => profile.id !== profileId),
    }))
    setDivisions((current) =>
      current.map((division) => {
        const withoutProfile = removeProfileAllocation(division, profileId)

        if (removedProfileIndex < 0) {
          return applyDivisionUsersBySplit(withoutProfile, nextProfiles)
        }

        const nextSplitPercents = [...withoutProfile.userSplitPercents]
        nextSplitPercents.splice(removedProfileIndex, 1)

        return applyDivisionUsersBySplit(
          {
            ...withoutProfile,
            userSplitPercents: nextSplitPercents,
          },
          nextProfiles,
        )
      }),
    )
  }

  const additionalProfileTotals = settings.profiles.slice(2).map((profile) => {
    const users = divisions.reduce(
      (sum, division) => sum + (division.allocations[profile.id]?.users ?? 0),
      0,
    )

    return {
      name: profile.name,
      users,
    }
  })

  const divisionPivotTable = metrics.divisions.map((division) => ({
    id: division.id,
    name: division.name,
    profileCells: settings.profiles.map((profile) => {
      const allocation = divisionMetricsById
        .get(division.id)
        ?.rows.find(({ profileId }) => profileId === profile.id)

      return {
        profileId: profile.id,
        profileName: profile.name,
        users: allocation?.users ?? 0,
        userLevelBudget: allocation?.userLevelBudget ?? 0,
        seatCost: allocation?.seatCost ?? 0,
      }
    }),
    totalUsers: division.totalUsers,
    sharedPoolCredits: division.includedCredits + division.overageCredits,
    overageCredits: division.overageCredits,
    userLevelBudget: division.totalOverageBudget,
    seatCost: division.seatCost,
  }))

  const openPrintablePage = () => {
    const printWindow = window.open('', '_blank', 'width=1200,height=900')

    if (!printWindow) {
      return
    }

    const printableTitle = companyInfo.companyName || 'GitHub Copilot Budget Planning'
    const printableDate = companyInfo.budgetPreparedOn
      ? new Date(companyInfo.budgetPreparedOn).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'Not specified'

    const divisionRowsHtml = metrics.divisions
      .map(
        (division) => `
          <tr>
            <th scope="row">${escapeHtml(division.name)}</th>
            <td>${formatNumber(division.totalUsers)}</td>
            <td>${formatNumber(division.includedCredits + division.overageCredits)}</td>
            <td>${formatNumber(division.overageCredits)}</td>
            <td>${formatCurrency(division.totalOverageBudget)}</td>
            <td>${formatCurrency(division.seatCost)}</td>
          </tr>
        `,
      )
      .join('')

    const profileTotalsHtml = settings.profiles
      .map((profile) => {
        const users = divisions.reduce(
          (sum, division) => sum + (division.allocations[profile.id]?.users ?? 0),
          0,
        )

        return `
          <li><strong>${escapeHtml(profile.name)}:</strong> ${formatNumber(users)}</li>
        `
      })
      .join('')

    const pivotHeadersHtml = settings.profiles
      .map((profile) => `<th>${escapeHtml(profile.name)}</th>`)
      .join('')

    const pivotRowsHtml = divisionPivotTable
      .map(
        (division) => `
          <tr>
            <th scope="row">${escapeHtml(division.name)}</th>
            ${division.profileCells
              .map(
                (cell) => `
                  <td>
                    ${formatNumber(cell.users)} users, ${formatCurrency(cell.userLevelBudget)} budget
                  </td>
                `,
              )
              .join('')}
            <td>${formatNumber(division.totalUsers)}</td>
            <td>${formatNumber(division.sharedPoolCredits)}</td>
            <td>${formatNumber(division.overageCredits)}</td>
            <td>${formatCurrency(division.userLevelBudget)}</td>
            <td>${formatCurrency(division.seatCost)}</td>
          </tr>
        `,
      )
      .join('')

    const printableHtml = `
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(printableTitle)} - Printable Report</title>
          <meta charset="utf-8" />
          <style>
            :root { color-scheme: light; }
            body {
              margin: 0;
              padding: 32px;
              font-family: Arial, Helvetica, sans-serif;
              color: #0f172a;
              background: #ffffff;
            }
            h1, h2, h3, p { margin: 0; }
            .report {
              display: grid;
              gap: 24px;
            }
            .header {
              padding-bottom: 16px;
              border-bottom: 2px solid #e2e8f0;
            }
            .header h1 {
              font-size: 28px;
              margin-bottom: 8px;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 12px;
              margin-top: 16px;
            }
            .meta {
              padding: 12px 14px;
              border: 1px solid #cbd5e1;
              border-radius: 12px;
              background: #f8fafc;
            }
            .meta span {
              display: block;
              font-size: 12px;
              color: #475569;
              margin-bottom: 6px;
              text-transform: uppercase;
              letter-spacing: 0.04em;
            }
            .meta strong {
              font-size: 15px;
            }
            .section {
              display: grid;
              gap: 12px;
            }
            .section h2 {
              font-size: 20px;
              padding-bottom: 8px;
              border-bottom: 1px solid #e2e8f0;
            }
            .summary-list {
              display: grid;
              gap: 8px;
              padding-left: 18px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }
            th, td {
              border-bottom: 1px solid #e2e8f0;
              padding: 10px 8px;
              text-align: left;
              vertical-align: top;
              word-break: break-word;
            }
            thead th {
              background: #eff6ff;
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.04em;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <main class="report">
            <section class="header">
              <h1>${escapeHtml(printableTitle)}</h1>
              <p>Prepared by: ${escapeHtml(companyInfo.budgetPreparedBy || 'Not specified')}</p>
              <p>Budget prepared on: ${escapeHtml(printableDate)}</p>
              <p>${escapeHtml(companyInfo.aboutBudget || 'No additional budget notes provided.')}</p>
              <div class="meta-grid">
                <div class="meta"><span>Total users</span><strong>${formatNumber(totalUsers)}</strong></div>
                <div class="meta"><span>Total divisions</span><strong>${formatNumber(metrics.divisions.length)}</strong></div>
                <div class="meta"><span>Total available AI Credits</span><strong>${formatNumber(metrics.totalAvailableCredits)}</strong></div>
              </div>
            </section>

            <section class="section">
              <h2>Profile totals</h2>
              <ul class="summary-list">${profileTotalsHtml}</ul>
            </section>

            <section class="section">
              <h2>Division pivot view</h2>
              <table>
                <thead>
                  <tr>
                    <th>Division</th>
                    ${pivotHeadersHtml}
                    <th>Users</th>
                    <th>Shared-pool AI Credits</th>
                    <th>Overage AI Credits</th>
                    <th>User-level budget</th>
                    <th>Seat cost</th>
                  </tr>
                </thead>
                <tbody>
                  ${pivotRowsHtml}
                </tbody>
              </table>
            </section>

            <section class="section">
              <h2>Division roll-up</h2>
              <table>
                <thead>
                  <tr>
                    <th>Division</th>
                    <th>Users</th>
                    <th>Shared-pool AI Credits</th>
                    <th>Overage AI Credits</th>
                    <th>User-level budget</th>
                    <th>Seat cost</th>
                  </tr>
                </thead>
                <tbody>
                  ${divisionRowsHtml}
                </tbody>
              </table>
            </section>
          </main>
        </body>
      </html>
    `

    printWindow.document.open()
    printWindow.document.write(printableHtml)
    printWindow.document.close()

    printWindow.focus()
  }

  return (
    <div className="app-shell">
      <header className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">GitHub Copilot budget planning</p>
          <h1>Model shared-pool AI Credits, division budgets, and overage.</h1>
          <p className="hero-text">
            Configure organization totals, start with Standard and Advanced
            assumptions, then add more profiles and allocate users and monthly
            budget by division.
          </p>
        </div>
        <div className="hero-form">
          <label className="hero-field hero-field--full">
            <span>Company/Department Name</span>
            <input
              type="text"
              value={companyInfo.companyName}
              onChange={(event) =>
                setCompanyInfo((current) => ({
                  ...current,
                  companyName: event.target.value,
                }))
              }
              placeholder="Enter company or department name"
            />
          </label>
          <label className="hero-field">
            <span>Budget Prepared by</span>
            <input
              type="text"
              value={companyInfo.budgetPreparedBy}
              onChange={(event) =>
                setCompanyInfo((current) => ({
                  ...current,
                  budgetPreparedBy: event.target.value,
                }))
              }
              placeholder="Enter preparer's name"
            />
          </label>
          <label className="hero-field">
            <span>Budget Prepared on</span>
            <input
              type="date"
              value={companyInfo.budgetPreparedOn}
              onChange={(event) =>
                setCompanyInfo((current) => ({
                  ...current,
                  budgetPreparedOn: event.target.value,
                }))
              }
            />
          </label>
          <label className="hero-field hero-field--full">
            <span>About this budget</span>
            <textarea
              value={companyInfo.aboutBudget}
              onChange={(event) =>
                setCompanyInfo((current) => ({
                  ...current,
                  aboutBudget: event.target.value,
                }))
              }
              placeholder="Add notes about scope, assumptions, and context"
              rows={4}
            />
          </label>
        </div>
      </header>

      <main className="layout-grid">
        <div className="stack">
          <section className="panel">
            <div className="section-header">
              <div>
                <p className="section-label">Inputs</p>
                <h2>Profile assumptions</h2>
              </div>
            </div>
            <p className="section-copy">
              The planner starts with Standard and Advanced. Add more profiles if
              your enterprise needs additional tiers. Check promotional for the
              3,000 AI Credits Jun-Aug 2026 offer.
            </p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Profile</th>
                    <th scope="col">Monthly price</th>
                    <th scope="col">Included AI Credits</th>
                    <th scope="col">Promotional</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.profiles.map((profile, index) => (
                    <tr key={profile.id}>
                      <td>
                        <input
                          type="text"
                          value={profile.name}
                          onChange={(event) =>
                            updateProfile(profile.id, 'name', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={profile.monthlyPrice}
                          onChange={(event) =>
                            updateProfile(
                              profile.id,
                              'monthlyPrice',
                              event.target.value,
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={profile.includedCredits}
                          onChange={(event) =>
                            updateProfile(
                              profile.id,
                              'includedCredits',
                              event.target.value,
                            )
                          }
                        />
                      </td>
                      <td>{formatNumber(getEffectiveIncludedCredits(profile))}</td>
                      <td>
                        <label className="checkbox-field">
                          <input
                            type="checkbox"
                            checked={profile.promotional}
                            onChange={(event) =>
                              updateProfile(
                                profile.id,
                                'promotional',
                                event.target.checked,
                              )
                            }
                          />
                          <span>Apply promo</span>
                        </label>
                      </td>
                      <td>
                        {index >= 2 && (
                          <button
                            type="button"
                            className="button button--ghost"
                            onClick={() => removeProfile(profile.id)}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="division-actions">
              <button type="button" className="button" onClick={addProfile}>
                Add Profile
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="section-header">
              <div>
                <p className="section-label">Inputs</p>
                <h2>Division plans</h2>
              </div>
            </div>
            <p className="section-copy">
              Assign users to divisions and reserve a monthly user-level budget for
              each profile inside that division.
            </p>

            <div className="division-list">
              {divisions.map((division) => {
                const divisionMetrics = divisionMetricsById.get(division.id)
                const primaryProfile = settings.profiles[0]
                const splitPercents = normalizeSplitPercents(
                  division.userSplitPercents,
                  settings.profiles.length,
                )
                const remainderPercent = round(100 - (splitPercents[0] ?? 0), 2)

                if (!divisionMetrics) {
                  return null
                }

                return (
                  <article key={division.id} className="division-card">
                    <div className="division-card__header">
                      <label className="field">
                        <span>Division name</span>
                        <input
                          type="text"
                          value={division.name}
                          onChange={(event) =>
                            updateDivisionName(division.id, event.target.value)
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => removeDivision(division.id)}
                        disabled={divisions.length === 1}
                      >
                        Remove
                      </button>
                    </div>

                    <div className="division-controls">
                      <div className="division-controls-row">
                        <label className="field division-users-field">
                          <span>Total division users</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={division.totalUsers}
                            onChange={(event) =>
                              updateDivisionTotalUsers(division.id, event.target.value)
                            }
                          />
                        </label>
                        <div className="division-percent-grid">
                          {settings.profiles.map((profile, index) => (
                            <label className="field division-percent" key={profile.id}>
                              <span>{`${profile.name} %`}</span>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={roundWhole(splitPercents[index] ?? 0)}
                                onChange={(event) =>
                                  updateDivisionSplit(
                                    division.id,
                                    index,
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="division-sliders">
                        {primaryProfile && settings.profiles.length > 1 && (
                          <label className="field division-slider" key={primaryProfile.id}>
                            <span>
                              {`${primaryProfile.name} split (${roundWhole(splitPercents[0] ?? 0)}%)`}
                            </span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="1"
                              value={splitPercents[0] ?? 0}
                              onChange={(event) =>
                                updateDivisionSplit(division.id, 0, event.target.value)
                              }
                            />
                          </label>
                        )}
                        {settings.profiles.length > 1 && (
                          <p className="division-remainder">
                            {`${remainderPercent.toFixed(2)}% remains across the other profile${settings.profiles.length - 1 === 1 ? '' : 's'} and auto-rebalances when you edit any percentage.`}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="table-wrap">
                      <table className="data-table data-table--compact">
                        <thead>
                          <tr>
                            <th scope="col">Profile</th>
                            <th scope="col">Users</th>
                            <th scope="col">User-level budget</th>
                            <th scope="col">Per-user AI Credits</th>
                            <th scope="col">Seat budget</th>
                            <th scope="col">Shared-pool AI Credits</th>
                            <th scope="col">Overage budget</th>
                            <th scope="col">Overage AI Credits</th>
                          </tr>
                        </thead>
                        <tbody>
                          {settings.profiles.map((profile) => {
                            const allocation = division.allocations[profile.id]
                            const row = divisionMetrics.rows.find(
                              ({ profileId }) => profileId === profile.id,
                            )

                            if (!allocation || !row) {
                              return null
                            }

                            return (
                              <tr key={profile.id}>
                                <th scope="row">{row.profileName}</th>
                                <td>{formatNumber(row.users)}</td>
                                <td>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={allocation.budget}
                                    onChange={(event) =>
                                      updateDivisionAllocation(
                                        division.id,
                                        profile.id,
                                        'budget',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </td>
                                <td>{formatNumber(row.perUserAiCredits)}</td>
                                <td>{formatCurrency(row.seatCost)}</td>
                                <td>
                                  {formatNumber(
                                    row.includedCredits + row.overageCredits,
                                  )}
                                </td>
                                <td>{formatCurrency(row.overageDollars)}</td>
                                <td>{formatNumber(row.overageCredits)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="metric-grid metric-grid--division">
                      <article className="metric-card">
                        <span>Assigned users</span>
                        <strong>{formatNumber(divisionMetrics.totalUsers)}</strong>
                      </article>
                      <article className="metric-card">
                        <span>Seat budget</span>
                        <strong>{formatCurrency(divisionMetrics.seatCost)}</strong>
                      </article>
                      <article className="metric-card">
                        <span>Shared-pool AI Credits</span>
                        <strong>
                          {formatNumber(
                            divisionMetrics.includedCredits +
                              divisionMetrics.overageCredits,
                          )}
                        </strong>
                      </article>
                      <article className="metric-card">
                        <span>Overage budget</span>
                        <strong>
                          {formatCurrency(divisionMetrics.overageDollars)}
                        </strong>
                      </article>
                      <article className="metric-card">
                        <span>Overage AI Credits</span>
                        <strong>
                          {formatNumber(divisionMetrics.overageCredits)}
                        </strong>
                      </article>
                      <article className="metric-card">
                        <span>User-level budget</span>
                        <strong>
                          {formatCurrency(divisionMetrics.totalOverageBudget)}
                        </strong>
                      </article>
                    </div>
                  </article>
                )
              })}
            </div>
            <div className="division-actions">
              <button type="button" className="button" onClick={addDivision}>
                Add division
              </button>
            </div>
          </section>
        </div>

        <aside className="results-stack">
          <section className="panel">
            <div className="section-header">
              <div>
                <p className="section-label">Results</p>
                <h2>Organization summary</h2>
              </div>
            </div>
            <div className="metric-grid">
              <article className="metric-card">
                <span>Total users of all profiles</span>
                <strong>{formatNumber(totalUsers)}</strong>
              </article>
              <article className="metric-card">
                <span>Total divisions</span>
                <strong>{formatNumber(metrics.divisions.length)}</strong>
              </article>
              <article className="metric-card">
                <span>Total users of Standard profile</span>
                <strong>{formatNumber(profileUserTotals.standardUsers)}</strong>
              </article>
              <article className="metric-card">
                <span>Total users of Advanced profile</span>
                <strong>{formatNumber(profileUserTotals.advancedUsers)}</strong>
              </article>
              {additionalProfileTotals.map((profile) => (
                <article className="metric-card" key={profile.name}>
                  <span>{`Total users of ${profile.name}`}</span>
                  <strong>{formatNumber(profile.users)}</strong>
                </article>
              ))}
              <article className="metric-card">
                <span>Shared-pool AI Credits</span>
                <strong>{formatNumber(metrics.totalAvailableCredits)}</strong>
              </article>
              <article className="metric-card">
                <span>Overage AI Credits</span>
                <strong>{formatNumber(metrics.totalOverageCredits)}</strong>
              </article>
              <article className="metric-card">
                <span>Seat cost</span>
                <strong>{formatCurrency(metrics.totalSeatCost)}</strong>
              </article>
              <article className="metric-card">
                <span>User-level budget</span>
                <strong>{formatCurrency(metrics.totalOverageBudget)}</strong>
              </article>
              <article className="metric-card">
                <span>Overage budget</span>
                <strong>{formatCurrency(metrics.totalOverageDollars)}</strong>
              </article>
              <article className="metric-card">
                <span>Total available AI Credits</span>
                <strong>{formatNumber(metrics.totalAvailableCredits)}</strong>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="section-header">
              <div>
                <p className="section-label">Results</p>
                <h2>Credit availability</h2>
              </div>
            </div>
            <div className="summary-copy">
              <p>
                Shared-pool credits include both included AI Credits from
                assigned seats and overage AI Credits. Overage credits come from
                user-level budget above the base seat cost, divided by the
                overage cost per credit. The base $19 seat cost is excluded
                from overage budget.
              </p>
              <p>{profileUserTotals.profileUserBreakdown}</p>
              <dl className="summary-list">
                <div>
                  <dt>Shared-pool AI Credits</dt>
                  <dd>{formatNumber(metrics.totalAvailableCredits)}</dd>
                </div>
                <div>
                  <dt>Potential overage AI Credits</dt>
                  <dd>{formatNumber(metrics.totalOverageCredits)}</dd>
                </div>
                <div>
                  <dt>Total available AI Credits</dt>
                  <dd>{formatNumber(metrics.totalAvailableCredits)}</dd>
                </div>
              </dl>
            </div>
          </section>
        </aside>
      </main>

      <section className="panel panel--wide">
        <div className="section-header">
          <div>
            <p className="section-label">Results</p>
            <h2>Division pivot view</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Division</th>
                {settings.profiles.map((profile) => (
                  <th scope="col" key={profile.id}>
                    {profile.name}
                  </th>
                ))}
                <th scope="col">Users</th>
                <th scope="col">Shared-pool AI Credits</th>
                <th scope="col">Overage AI Credits</th>
                <th scope="col">User-level budget</th>
                <th scope="col">Seat cost</th>
              </tr>
            </thead>
            <tbody>
              {divisionPivotTable.map((division) => (
                <tr key={division.id}>
                  <th scope="row">{division.name}</th>
                  {division.profileCells.map((cell) => (
                    <td key={cell.profileId}>
                      {cell.users > 0 || cell.userLevelBudget > 0
                        ? `${formatNumber(cell.users)} users, ${formatCurrency(cell.userLevelBudget)} budget`
                        : '0 users, $0 budget'}
                    </td>
                  ))}
                  <td>{formatNumber(division.totalUsers)}</td>
                  <td>{formatNumber(division.sharedPoolCredits)}</td>
                  <td>{formatNumber(division.overageCredits)}</td>
                  <td>{formatCurrency(division.userLevelBudget)}</td>
                  <td>{formatCurrency(division.seatCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="section-header section-header--compact">
          <div>
            <p className="section-label">Results</p>
            <h2>Division roll-up</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table data-table--secondary">
            <thead>
              <tr>
                <th scope="col">Division</th>
                <th scope="col">Users</th>
                <th scope="col">Shared-pool AI Credits</th>
                <th scope="col">Overage AI Credits</th>
                <th scope="col">User-level budget</th>
                <th scope="col">Seat cost</th>
              </tr>
            </thead>
            <tbody>
              {metrics.divisions.map((division) => (
                <tr key={division.id}>
                  <th scope="row">{division.name}</th>
                  <td>{formatNumber(division.totalUsers)}</td>
                  <td>
                    {formatNumber(
                      division.includedCredits + division.overageCredits,
                    )}
                  </td>
                  <td>{formatNumber(division.overageCredits)}</td>
                  <td>{formatCurrency(division.totalOverageBudget)}</td>
                  <td>{formatCurrency(division.seatCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="page-actions">
        <button type="button" className="button" onClick={openPrintablePage}>
          Open printable page
        </button>
      </footer>
    </div>
  )
}

export default App
