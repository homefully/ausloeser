import * as core from "@actions/core"
import * as github from "@actions/github"

export function error(msg: string): never {
    core.setFailed(msg)

    throw new Error(msg)
}

export async function run() {
    try {
        const payload = github.context.payload

        const token = core.getInput("pat")
        const octokit = github.getOctokit(token)

        const owner =
            payload.repository?.owner?.login ??
            error("no repository owner found in payload")
        const repo =
            payload.repository?.name ??
            error("no repository name found in payload")
        const commentId = payload.comment?.id ?? payload.inputs?.commentId
        if (commentId === undefined) {
            return
        }

        if (payload.issue?.pull_request === undefined) {
            core.info("No PR found in event. Ignoring.")
            return
        }

        await octokit.reactions.createForIssueComment({
            owner,
            repo,
            comment_id: commentId,
            content: "eyes",
        })

        const pullNumber =
            payload.issue?.number ?? error("no issue number found in payload")

        const issue = await octokit.pulls.get({
            owner,
            repo,
            pull_number: pullNumber,
        })

        const user = issue.data.user.login

        const comment = payload.comment?.body
        if (comment === undefined || typeof comment !== "string") {
            return
        }

        const match = comment.match(/^\/(.+?)(\s|$)/)
        if (match === null) {
            console.log("No command found")
            return
        }

        const command = match[1]

        const trigger = core.getInput("command", { required: true })
        if (command !== trigger) {
            console.log(command + " does not match trigger " + trigger)
            return
        }

        const workflowName = core.getInput("workflow", { required: true })

        let workflowId: number | undefined = undefined
        let page = 1
        while (true) {
            const workflows = await octokit.actions.listRepoWorkflows({
                owner,
                repo,
                page,
                per_page: 50,
            })

            if (workflows.data.workflows.length === 0) {
                break
            }

            const workflow = workflows.data.workflows.find(
                (it) => it.name === workflowName
            )
            if (workflow !== undefined) {
                workflowId = workflow.id
                break
            }

            page++
        }

        const pr = issue.data
        const ref = pr.head.ref

        if (workflowId === undefined) {
            console.log("did not find workflow " + workflowName)
            return
        }

        const result = await octokit.actions.createWorkflowDispatch({
            owner,
            repo,
            workflow_id: workflowId,
            ref,
            inputs: {
                comment: comment.toString(),
                user: user.toString(),
                commentId: commentId.toString(),
            },
        })

        return
    } catch (e) {
        core.info("error")
        core.info(e.toString())
        core.setFailed(e.message)
        core.setFailed(e)
    }
}

run()
