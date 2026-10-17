// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorktreeCardDetailsHover, WorktreeCardMetaBadges } from './WorktreeCardMeta'

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn()
}))

const interactionMocks = vi.hoisted(() => ({
  hoverOpen: false,
  onHoverOpenChange: undefined as ((open: boolean) => void) | undefined,
  reviewMenuOpen: false,
  onReviewMenuOpenChange: undefined as ((open: boolean) => void) | undefined,
  onUnlinkSelect: undefined as (() => void) | undefined
}))

vi.mock('sonner', () => ({
  toast: toastMocks
}))

vi.mock('@/components/ui/hover-card', () => ({
  HoverCard: ({
    children,
    open,
    onOpenChange
  }: {
    children: ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }) => {
    interactionMocks.hoverOpen = open ?? false
    interactionMocks.onHoverOpenChange = onOpenChange
    return <div data-hover-open={open ? 'true' : 'false'}>{children}</div>
  },
  HoverCardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children, open }: { children: ReactNode; open?: boolean }) => (
    <div data-tooltip-open={open === false ? 'false' : 'default'}>{children}</div>
  ),
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({
    children,
    open,
    onOpenChange
  }: {
    children: ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }) => {
    interactionMocks.reviewMenuOpen = open ?? false
    interactionMocks.onReviewMenuOpenChange = onOpenChange
    return <div data-review-menu-open={open ? 'true' : 'false'}>{children}</div>
  },
  DropdownMenuTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  )
}))

const reviewFixture = {
  provider: 'github' as const,
  number: 456,
  title: 'Fix stale GH PR',
  state: 'open' as const,
  url: 'https://github.com/acme/orca/pull/456',
  status: 'success' as const,
  updatedAt: '2026-05-17T00:00:00.000Z',
  mergeable: 'MERGEABLE' as const
}

describe('WorktreeCardDetailsHover interactions', () => {
  let container: HTMLDivElement
  let root: Root
  const writeClipboardText = vi.fn()

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    interactionMocks.hoverOpen = false
    interactionMocks.reviewMenuOpen = false
    interactionMocks.onHoverOpenChange = undefined
    interactionMocks.onReviewMenuOpenChange = undefined
    interactionMocks.onUnlinkSelect = undefined
    writeClipboardText.mockReset()
    toastMocks.success.mockReset()
    toastMocks.error.mockReset()
  })

  beforeEach(() => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        ui: {
          writeClipboardText
        }
      }
    })
    writeClipboardText.mockResolvedValue(undefined)
  })

  function renderHover(
    onUnlinkReview = vi.fn(),
    onOpenReviewInBrowser?: () => void
  ): ReturnType<typeof vi.fn> {
    container = document.createElement('div')
    root = createRoot(container)
    act(() => {
      root.render(
        <WorktreeCardDetailsHover
          issue={null}
          linearIssue={null}
          review={reviewFixture}
          comment={null}
          onEditIssue={vi.fn()}
          onEditComment={vi.fn()}
          onOpenReviewInOrca={vi.fn()}
          onUnlinkReview={onUnlinkReview}
          onOpenReviewInBrowser={onOpenReviewInBrowser}
        >
          <span>Linked PR</span>
        </WorktreeCardDetailsHover>
      )
    })
    return onUnlinkReview
  }

  function renderEditableHover(onRenameWorkspaceTitle = vi.fn()): ReturnType<typeof vi.fn> {
    container = document.createElement('div')
    root = createRoot(container)
    act(() => {
      root.render(
        <WorktreeCardDetailsHover
          issue={null}
          linearIssue={null}
          review={null}
          comment={null}
          workspaceTitle="Editable hover title"
          onRenameWorkspaceTitle={onRenameWorkspaceTitle}
        >
          <span>Workspace card</span>
        </WorktreeCardDetailsHover>
      )
    })
    return onRenameWorkspaceTitle
  }

  it('defers hover close while the review menu is open', () => {
    renderHover()

    act(() => {
      interactionMocks.onHoverOpenChange?.(true)
      interactionMocks.onReviewMenuOpenChange?.(true)
      interactionMocks.onHoverOpenChange?.(false)
    })

    expect(container.querySelector('[data-hover-open]')?.getAttribute('data-hover-open')).toBe(
      'true'
    )
  })

  it('closes the hover after the review menu dismisses a deferred close', () => {
    renderHover()

    act(() => {
      interactionMocks.onHoverOpenChange?.(true)
      interactionMocks.onReviewMenuOpenChange?.(true)
      interactionMocks.onHoverOpenChange?.(false)
      interactionMocks.onReviewMenuOpenChange?.(false)
    })

    expect(container.querySelector('[data-hover-open]')?.getAttribute('data-hover-open')).toBe(
      'false'
    )
  })

  it('omits the review trigger tooltip while the review menu is open', () => {
    renderHover()

    act(() => {
      interactionMocks.onReviewMenuOpenChange?.(true)
    })

    expect(container.textContent).not.toContain('More PR actions')
  })

  it('keeps the hover mounted while the workspace title is being edited', () => {
    renderEditableHover()

    act(() => {
      interactionMocks.onHoverOpenChange?.(true)
    })
    const title = container.querySelector('[data-worktree-title-inline-rename]')

    act(() => {
      title?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    })
    const input = container.querySelector('[data-worktree-title-rename-input]')

    expect(input).not.toBeNull()
    expect(input?.className).toContain('bg-input/40')
    expect(input?.className).toContain('rounded-sm')
    expect(input?.className).toContain('selection:bg-[Highlight]')
    expect(input?.className).toContain('focus-visible:ring-[1px]')

    act(() => {
      interactionMocks.onHoverOpenChange?.(false)
    })

    expect(container.querySelector('[data-hover-open]')?.getAttribute('data-hover-open')).toBe(
      'true'
    )

    act(() => {
      input?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
    })

    expect(container.querySelector('[data-hover-open]')?.getAttribute('data-hover-open')).toBe(
      'false'
    )
  })

  it('invokes unlink and closes the hover from the menu item', () => {
    const onUnlinkReview = renderHover()

    act(() => {
      interactionMocks.onHoverOpenChange?.(true)
      interactionMocks.onReviewMenuOpenChange?.(true)
    })

    const unlinkButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Unlink PR from workspace')
    )

    act(() => {
      unlinkButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onUnlinkReview).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-hover-open]')?.getAttribute('data-hover-open')).toBe(
      'false'
    )
    expect(
      container.querySelector('[data-review-menu-open]')?.getAttribute('data-review-menu-open')
    ).toBe('false')
  })

  it('copies the review URL and closes the hover from the menu item', async () => {
    const onUnlinkReview = renderHover()

    act(() => {
      interactionMocks.onHoverOpenChange?.(true)
      interactionMocks.onReviewMenuOpenChange?.(true)
    })

    const copyButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Copy link')
    )

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(writeClipboardText).toHaveBeenCalledWith('https://github.com/acme/orca/pull/456')
    expect(onUnlinkReview).not.toHaveBeenCalled()
    expect(toastMocks.success).toHaveBeenCalledWith('PR link copied')
    expect(container.querySelector('[data-hover-open]')?.getAttribute('data-hover-open')).toBe(
      'false'
    )
    expect(
      container.querySelector('[data-review-menu-open]')?.getAttribute('data-review-menu-open')
    ).toBe('false')
  })

  it('opens the review URL in Orca browser and leaves existing actions independent', () => {
    const onOpenReviewInBrowser = vi.fn()
    const onUnlinkReview = renderHover(vi.fn(), onOpenReviewInBrowser)

    act(() => {
      interactionMocks.onHoverOpenChange?.(true)
      interactionMocks.onReviewMenuOpenChange?.(true)
    })

    const browserButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Open in Orca browser')
    )

    act(() => {
      browserButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onOpenReviewInBrowser).toHaveBeenCalledWith('https://github.com/acme/orca/pull/456')
    expect(onUnlinkReview).not.toHaveBeenCalled()
    expect(container.querySelector('[data-hover-open]')?.getAttribute('data-hover-open')).toBe(
      'false'
    )
  })

  it('preserves repeated-click behavior by forwarding each browser action', () => {
    const onOpenReviewInBrowser = vi.fn()
    renderHover(vi.fn(), onOpenReviewInBrowser)

    act(() => {
      interactionMocks.onReviewMenuOpenChange?.(true)
    })
    const browserButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Open in Orca browser')
    )

    act(() => {
      browserButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      browserButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onOpenReviewInBrowser).toHaveBeenCalledTimes(2)
  })

  it('reports clipboard failures without unlinking the review', async () => {
    writeClipboardText.mockRejectedValueOnce(new Error('clipboard unavailable'))
    const onUnlinkReview = renderHover()

    act(() => {
      interactionMocks.onHoverOpenChange?.(true)
      interactionMocks.onReviewMenuOpenChange?.(true)
    })

    const copyButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Copy link')
    )

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(writeClipboardText).toHaveBeenCalledWith('https://github.com/acme/orca/pull/456')
    expect(onUnlinkReview).not.toHaveBeenCalled()
    expect(toastMocks.error).toHaveBeenCalledWith('Failed to copy link')
  })

  it('passes a linked issue URL to the embedded-browser action', () => {
    const onOpenIssueInBrowser = vi.fn()
    container = document.createElement('div')
    root = createRoot(container)
    act(() => {
      root.render(
        <WorktreeCardDetailsHover
          issue={{
            number: 5518,
            title: 'Agent monitor issue',
            state: 'open',
            url: 'https://github.com/acme/orca/issues/5518',
            labels: []
          }}
          linearIssue={null}
          review={null}
          comment={null}
          onOpenIssueInBrowser={onOpenIssueInBrowser}
        >
          <span>Linked issue</span>
        </WorktreeCardDetailsHover>
      )
    })

    act(() => {
      interactionMocks.onHoverOpenChange?.(true)
      interactionMocks.onReviewMenuOpenChange?.(true)
    })
    const browserButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Open in Orca browser')
    )

    act(() => {
      browserButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onOpenIssueInBrowser).toHaveBeenCalledWith('https://github.com/acme/orca/issues/5518')
  })
})

describe('sidebar review badge interactions', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it.each([
    ['github', 'PR #456'],
    ['gitlab', 'MR #456']
  ] as const)(
    'isolates the %s review link from workspace selection and dragging',
    (provider, label) => {
      const onRowClick = vi.fn()
      const onRowPointerDown = vi.fn()
      const onRowDoubleClick = vi.fn()
      act(() => {
        root.render(
          <div
            onClick={onRowClick}
            onPointerDown={onRowPointerDown}
            onDoubleClick={onRowDoubleClick}
            draggable
          >
            <WorktreeCardMetaBadges
              issue={null}
              linearIssue={null}
              comment={null}
              review={{ ...reviewFixture, provider }}
            />
          </div>
        )
      })
      const link = container.querySelector('a')
      expect(link?.textContent).toBe(label)
      expect(link?.getAttribute('href')).toBe(reviewFixture.url)
      expect(link?.getAttribute('draggable')).toBe('false')
      const click = new MouseEvent('click', { bubbles: true, cancelable: true })
      act(() => {
        link?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
        link?.dispatchEvent(click)
        link?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      })
      expect(onRowClick).not.toHaveBeenCalled()
      expect(onRowPointerDown).not.toHaveBeenCalled()
      expect(onRowDoubleClick).not.toHaveBeenCalled()
      expect(click.defaultPrevented).toBe(false)
    }
  )

  it.each([
    ['github', 'PR #456'],
    ['gitlab', 'MR #456']
  ] as const)(
    'keeps a %s review without a URL passive and lets the workspace handle events',
    (provider, label) => {
      const onRowClick = vi.fn()
      const onRowPointerDown = vi.fn()
      const onRowDoubleClick = vi.fn()
      act(() => {
        root.render(
          <div
            onClick={onRowClick}
            onPointerDown={onRowPointerDown}
            onDoubleClick={onRowDoubleClick}
          >
            <WorktreeCardMetaBadges
              issue={null}
              linearIssue={null}
              comment={null}
              review={{ ...reviewFixture, provider, url: undefined }}
            />
          </div>
        )
      })
      expect(container.querySelector('a, button, [role="button"]')).toBeNull()
      const badge = container.querySelector('[data-slot="badge"]')
      expect(badge?.textContent).toBe(label)
      expect(badge?.getAttribute('aria-label')).toBe(`Linked ${label}`)
      act(() => {
        badge?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
        badge?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        badge?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      })
      expect(onRowClick).toHaveBeenCalledTimes(1)
      expect(onRowPointerDown).toHaveBeenCalledTimes(1)
      expect(onRowDoubleClick).toHaveBeenCalledTimes(1)
    }
  )
})
