function normalizeContainerSize(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase() === '40FT' ? '40FT' : '20FT';
}

function findImplicitMatch(container, currentJobs, claimedIds) {
  const availableJobs = currentJobs.filter((job) => !claimedIds.has(job.id));
  const desiredSize = normalizeContainerSize(container.size || container.containerSize);

  return availableJobs.find((job) => (
    job.status !== 'cancelled' && normalizeContainerSize(job.container_size) === desiredSize
  ))
    || availableJobs.find((job) => job.status === 'received')
    || availableJobs.find((job) => (
      job.status === 'cancelled' && normalizeContainerSize(job.container_size) === desiredSize
    ))
    || null;
}

export function reconcileSalesOrderContainers(submittedContainers = [], currentJobs = []) {
  const jobsById = new Map(currentJobs.map((job) => [job.id, job]));
  const claimedIds = new Set();

  const assignments = submittedContainers.map((container) => {
    const explicitMatch = container.id && !claimedIds.has(container.id)
      ? jobsById.get(container.id)
      : null;
    const currentJob = explicitMatch || findImplicitMatch(container, currentJobs, claimedIds);

    if (currentJob) claimedIds.add(currentJob.id);
    return { container, currentJob: currentJob || null };
  });

  return {
    assignments,
    removableIds: currentJobs
      .filter((job) => job.status === 'received' && !claimedIds.has(job.id))
      .map((job) => job.id),
  };
}
