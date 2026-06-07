export type ProfileId = string

export interface ProfileConfig {
  id: ProfileId
  name: string
  monthlyPrice: number
  includedCredits: number
  promotional: boolean
}

export interface DivisionProfileAllocation {
  users: number
  budget: number
}

export interface Division {
  id: string
  name: string
  totalUsers: number
  userSplitPercents: number[]
  allocations: Record<ProfileId, DivisionProfileAllocation>
}

export interface OrganizationSettings {
  totalUsers: number
  overageCostPerCredit: number
  profiles: ProfileConfig[]
}

export interface DivisionProfileMetrics {
  profileId: ProfileId
  profileName: string
  users: number
  perUserAiCredits: number
  userLevelBudget: number
  seatCost: number
  includedCredits: number
  overageDollars: number
  overageCredits: number
}

export interface DivisionMetrics {
  id: string
  name: string
  rows: DivisionProfileMetrics[]
  totalUsers: number
  totalOverageBudget: number
  seatCost: number
  includedCredits: number
  overageDollars: number
  overageCredits: number
}

export interface OrganizationMetrics {
  divisions: DivisionMetrics[]
  assignedUsers: number
  userVariance: number
  totalOverageBudget: number
  totalSeatCost: number
  totalIncludedCredits: number
  totalOverageDollars: number
  totalOverageCredits: number
  totalAvailableCredits: number
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits))
const baseIncludedPrice = 19

const createDefaultUserSplitPercents = (profileCount: number): number[] => {
  if (profileCount <= 1) {
    return []
  }

  const evenPercent = round(100 / profileCount, 2)
  return Array.from({ length: profileCount - 1 }, () => evenPercent)
}

const emptyAllocation = (): DivisionProfileAllocation => ({
  users: 0,
  budget: 19,
})

export const createProfile = (
  name: string,
  monthlyPrice: number,
  includedCredits: number,
  promotional = false,
): ProfileConfig => ({
  id: crypto.randomUUID(),
  name,
  monthlyPrice,
  includedCredits,
  promotional,
})

export const defaultOrganizationSettings: OrganizationSettings = {
  totalUsers: 0,
  overageCostPerCredit: 0.01,
  profiles: [
    createProfile('Standard', 19, 1900),
    createProfile('Advanced', 19, 1900),
  ],
}

const isPromoPeriod = (budgetPreparedOn?: string) => {
  if (!budgetPreparedOn) {
    return false
  }

  const preparedDate = new Date(`${budgetPreparedOn}T00:00:00`)
  const promoStart = new Date('2026-06-01T00:00:00')
  const promoEnd = new Date('2026-08-31T23:59:59')

  return preparedDate >= promoStart && preparedDate <= promoEnd
}

const createAllocations = (
  profiles: ProfileConfig[],
): Record<ProfileId, DivisionProfileAllocation> =>
  Object.fromEntries(
    profiles.map((profile) => [profile.id, emptyAllocation()]),
  ) as Record<ProfileId, DivisionProfileAllocation>

export const createDivision = (
  name: string,
  profiles: ProfileConfig[],
): Division => ({
  id: crypto.randomUUID(),
  name,
  totalUsers: 0,
  userSplitPercents: createDefaultUserSplitPercents(profiles.length),
  allocations: createAllocations(profiles),
})

export const buildProfileSplitPercents = (
  rawSplitPercents: number[],
  profileCount: number,
): number[] => {
  if (profileCount <= 0) {
    return []
  }

  const result: number[] = []
  let consumed = 0

  for (let index = 0; index < profileCount - 1; index += 1) {
    const requested = Number.isFinite(rawSplitPercents[index])
      ? rawSplitPercents[index]
      : 0
    const clamped = Math.max(0, Math.min(requested, 100 - consumed))
    const rounded = round(clamped, 2)

    result.push(rounded)
    consumed = round(consumed + rounded, 2)
  }

  result.push(round(Math.max(100 - consumed, 0), 2))
  return result
}

export const distributeUsersBySplitPercents = (
  totalUsers: number,
  splitPercents: number[],
): number[] => {
  const safeTotalUsers = Math.max(0, Math.floor(totalUsers))

  if (splitPercents.length === 0) {
    return []
  }

  const distributedUsers = splitPercents.map((percent, index) =>
    index === splitPercents.length - 1
      ? 0
      : Math.floor((safeTotalUsers * Math.max(percent, 0)) / 100),
  )

  const assignedUsers = distributedUsers.reduce((sum, users) => sum + users, 0)
  distributedUsers[distributedUsers.length - 1] = Math.max(
    safeTotalUsers - assignedUsers,
    0,
  )

  return distributedUsers
}

export const addProfileAllocation = (
  division: Division,
  profileId: ProfileId,
  profileCount: number,
): Division => ({
  ...division,
  userSplitPercents: [
    ...division.userSplitPercents,
    0,
  ].slice(0, Math.max(profileCount - 1, 0)),
  allocations: {
    ...division.allocations,
    [profileId]: emptyAllocation(),
  },
})

export const removeProfileAllocation = (
  division: Division,
  profileId: ProfileId,
): Division => {
  const { [profileId]: _removedAllocation, ...allocations } = division.allocations

  return {
    ...division,
    allocations,
  }
}

export const calculateDivisionMetrics = (
  division: Division,
  profiles: ProfileConfig[],
  overageCostPerCredit: number,
  promotionalActive: boolean,
): DivisionMetrics => {
  const rows = profiles.map((profile) => {
    const allocation = division.allocations[profile.id] ?? emptyAllocation()
    const seatCostPerUser = Math.max(allocation.budget, baseIncludedPrice)
    const promotionalCredits = promotionalActive && profile.promotional
      ? Math.max(3000 - profile.includedCredits, 0)
      : 0
    const effectiveIncludedCredits = profile.includedCredits + promotionalCredits
    const includedCreditsDollarValue =
      overageCostPerCredit > 0
        ? effectiveIncludedCredits * overageCostPerCredit
        : baseIncludedPrice
    const baseSeatPricePerUser = Math.max(includedCreditsDollarValue, baseIncludedPrice)
    const overageDollarsPerUser = Math.max(
      seatCostPerUser - baseSeatPricePerUser,
      0,
    )
    const overageCreditsPerUser =
      overageDollarsPerUser > 0 && overageCostPerCredit > 0
        ? overageDollarsPerUser / overageCostPerCredit
        : 0
    const perUserAiCredits = effectiveIncludedCredits
      + overageCreditsPerUser
    const seatCost = allocation.users * seatCostPerUser
    const includedCredits = allocation.users * effectiveIncludedCredits
    const overageDollars = allocation.users * overageDollarsPerUser
    const overageCredits =
      overageDollars > 0 && overageCostPerCredit > 0
        ? overageDollars / overageCostPerCredit
        : 0

    return {
      profileId: profile.id,
      profileName: profile.name,
      users: allocation.users,
      perUserAiCredits: round(perUserAiCredits, 0),
      userLevelBudget: round(allocation.budget),
      seatCost: round(seatCost),
      includedCredits: round(includedCredits, 0),
      overageDollars: round(overageDollars),
      overageCredits: round(overageCredits, 0),
    }
  })

  const totalUsers = rows.reduce((sum, row) => sum + row.users, 0)
  const totalOverageBudget = round(
    rows.reduce((sum, row) => sum + row.users * row.userLevelBudget, 0),
  )
  const seatCost = round(rows.reduce((sum, row) => sum + row.seatCost, 0))
  const includedCredits = round(
    rows.reduce((sum, row) => sum + row.includedCredits, 0),
    0,
  )
  const overageDollars = round(
    rows.reduce((sum, row) => sum + row.overageDollars, 0),
  )
  const overageCredits = round(
    rows.reduce((sum, row) => sum + row.overageCredits, 0),
    0,
  )

  return {
    id: division.id,
    name: division.name,
    rows,
    totalUsers,
    totalOverageBudget,
    seatCost,
    includedCredits,
    overageDollars,
    overageCredits,
  }
}

export const calculateOrganizationMetrics = (
  divisions: Division[],
  settings: OrganizationSettings,
  promotionalActive = false,
): OrganizationMetrics => {
  const divisionMetrics = divisions.map((division) =>
    calculateDivisionMetrics(
      division,
      settings.profiles,
      settings.overageCostPerCredit,
      promotionalActive,
    ),
  )

  const assignedUsers = divisionMetrics.reduce(
    (sum, division) => sum + division.totalUsers,
    0,
  )
  const totalOverageBudget = round(
    divisionMetrics.reduce((sum, division) => sum + division.totalOverageBudget, 0),
  )
  const totalSeatCost = round(
    divisionMetrics.reduce((sum, division) => sum + division.seatCost, 0),
  )
  const totalIncludedCredits = round(
    divisionMetrics.reduce((sum, division) => sum + division.includedCredits, 0),
    0,
  )
  const totalOverageDollars = round(
    divisionMetrics.reduce((sum, division) => sum + division.overageDollars, 0),
  )
  const totalOverageCredits = round(
    divisionMetrics.reduce((sum, division) => sum + division.overageCredits, 0),
    0,
  )

  return {
    divisions: divisionMetrics,
    assignedUsers,
    userVariance: settings.totalUsers - assignedUsers,
    totalOverageBudget,
    totalSeatCost,
    totalIncludedCredits,
    totalOverageDollars,
    totalOverageCredits,
    totalAvailableCredits: totalIncludedCredits + totalOverageCredits,
  }
}

export const calculatePromotionActive = (budgetPreparedOn?: string) =>
  isPromoPeriod(budgetPreparedOn)
