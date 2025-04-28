import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Parse the issue body to extract form fields
function parseIssueBody(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  
  // Look for each field heading in the form response
  const fieldRegexes = {
    'context': /### Context\s+([\s\S]*?)(?=###|$)/,
    'decision': /### Decision\s+([\s\S]*?)(?=###|$)/,
    'consequences': /### Consequences\s+([\s\S]*?)(?=###|$)/,
    'alternatives': /### Alternatives Considered\s+([\s\S]*?)(?=###|$)/,
    'references': /### References\s+([\s\S]*?)(?=###|$)/
  };
  
  for (const [field, regex] of Object.entries(fieldRegexes)) {
    const match = body.match(regex);
    fields[field] = match ? match[1].trim() : '';
  }
  
  return fields;
}

function getNextSequenceNumber(folder: string): string {
  // Ensure the folder exists
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    return '0001'; // Start with the first sequence number
  }

  // Get all files in the folder
  const files = fs.readdirSync(folder);

  // Filter for files that match the ADR naming convention (e.g., 0001-*.md)
  const sequenceNumbers = files
    .map(file => {
      const match = file.match(/^(\d{4})-/); // Match files starting with a 4-digit number followed by a dash
      return match ? parseInt(match[1], 10) : null;
    })
    .filter(num => num !== null) as number[];

  // Determine the next sequence number
  const nextNumber = sequenceNumbers.length > 0 ? Math.max(...sequenceNumbers) + 1 : 1;

  // Format the sequence number as a 4-digit string
  return nextNumber.toString().padStart(4, '0');
}

async function run() {
  try {
    // Input parameters
    const labelName = core.getInput('label_name', { required: true });
    const destinationFolder = core.getInput('destination_folder', { required: true });
    const adrStatus = core.getInput('adr_status', { required: false }) || 'proposed'; // Default to 'proposed'

    // Validate ADR status
    const validStatuses = ['accepted', 'proposed', 'rejected'];
    if (!validStatuses.includes(adrStatus)) {
      core.setFailed(`Invalid adr_status: ${adrStatus}. Must be one of: ${validStatuses.join(', ')}`);
      return;
    }

    // Get GitHub context and issue details
    const issue = github.context.payload.issue;
    if (!issue) {
      core.setFailed('This action must be triggered by an issue event.');
      return;
    }

    // Check if the issue has the specified label
    const hasLabel = issue.labels.some((label: any) => label.name === labelName);
    if (!hasLabel) {
      core.info(`The issue does not have the label "${labelName}". Skipping.`);
      return;
    }

    // Determine the sub-folder based on ADR status
    const statusFolder = path.join(destinationFolder, adrStatus);

    // Determine the next sequence number
    const nextSequenceNumber = getNextSequenceNumber(statusFolder);

    // Parse form fields from issue body
    const formFields = parseIssueBody(issue.body || '');

    // Prepare ADR content with specific form fields
    const adrContent = `
# ADR: ${issue.title}

## Status
${adrStatus.charAt(0).toUpperCase() + adrStatus.slice(1)}

## Context
${formFields.context || 'No context provided.'}

## Decision
${formFields.decision || 'No decision provided.'}

## Consequences
${formFields.consequences || 'No consequences provided.'}

${formFields.alternatives ? `## Alternatives Considered\n${formFields.alternatives}` : ''}

${formFields.references ? `## References\n${formFields.references}` : ''}
`;

    // Sanitize the issue title for use in the filename
    const sanitizedTitle = issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const fileName = `${nextSequenceNumber}-${sanitizedTitle}.md`;
    const filePath = path.join(statusFolder, fileName);

    // Ensure the sub-folder exists
    if (!fs.existsSync(statusFolder)) {
      fs.mkdirSync(statusFolder, { recursive: true });
    }

    // Write ADR content to the file
    fs.writeFileSync(filePath, adrContent.trim());
    core.info(`ADR file created: ${filePath}`);

    // Replace the Git commands with GitHub API calls
    const token = core.getInput('github_token') || process.env.GITHUB_TOKEN;
    if (!token) {
      core.setFailed('No GitHub token provided. Please set the GITHUB_TOKEN secret.');
      return;
    }

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    // Get the current commit SHA to use as a base
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: 'heads/main'
    });
    const baseSha = refData.object.sha;

    // Get the current tree
    const { data: commitData } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: baseSha
    });
    const treeSha = commitData.tree.sha;

    // Create a blob with the new file content
    const { data: blobData } = await octokit.rest.git.createBlob({
      owner,
      repo,
      content: Buffer.from(adrContent.trim()).toString('base64'),
      encoding: 'base64'
    });

    // Create a new tree with the new file
    const { data: newTreeData } = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: treeSha,
      tree: [
        {
          path: path.join(destinationFolder, adrStatus, fileName),
          mode: '100644',
          type: 'blob',
          sha: blobData.sha
        }
      ]
    });

    // Create a new commit
    const { data: newCommitData } = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: `Add ADR #${issue.number}: ${issue.title}`,
      tree: newTreeData.sha,
      parents: [baseSha]
    });

    // Update the reference
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: 'heads/main',
      sha: newCommitData.sha
    });

    core.info(`ADR file committed and pushed: ${filePath}`);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}

run();
