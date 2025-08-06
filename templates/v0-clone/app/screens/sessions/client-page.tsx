"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState, useMemo } from "react";
import { Loader, SearchIcon, XIcon, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Id } from "@/convex/_generated/dataModel";
import { deleteSessionAction } from "../../actions/vibekit";

const ITEMS_PER_PAGE = 15;

export default function SessionsClientPage() {
  const { data: session } = useSession();
  const sessions = useQuery(
    api.sessions.list,
    session?.githubId
      ? {
          createdBy: session.githubId.toString(),
        }
      : "skip"
  );
  const deleteSession = useMutation(api.sessions.remove);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{
    id: string;
    sessionId?: string;
    name: string;
  } | null>(null);
  const router = useRouter();

  // Get unique statuses for filter dropdown
  const uniqueStatuses = useMemo(() => {
    if (!sessions) return [];
    return [...new Set(sessions.map((session) => session.status))].sort();
  }, [sessions]);

  // Filter and paginate data
  const filteredAndPaginatedData = useMemo(() => {
    if (!sessions) return { data: [], totalPages: 0, filteredCount: 0 };

    // Apply filters
    const filtered = sessions.filter((session) => {
      const matchesSearch =
        searchTerm === "" ||
        session.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (session.sessionId &&
          session.sessionId.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (session.statusMessage &&
          session.statusMessage
            .toLowerCase()
            .includes(searchTerm.toLowerCase()));

      const matchesStatus =
        statusFilter === "" || session.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    const filteredCount = filtered.length;

    // Apply pagination
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const data = filtered.slice(startIndex, endIndex);
    const totalPages = Math.ceil(filteredCount / ITEMS_PER_PAGE);

    return { data, totalPages, filteredCount };
  }, [sessions, searchTerm, statusFilter, currentPage]);

  // Reset to first page when filters change
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("");
    setCurrentPage(1);
  };

  const handleSessionClick = (sessionId: string) => {
    router.push(`/session/${sessionId}`);
  };

  const goToPage = (page: number) => {
    setCurrentPage(page);
  };

  const goToPrevious = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const goToNext = () => {
    setCurrentPage((prev) =>
      Math.min(prev + 1, filteredAndPaginatedData.totalPages)
    );
  };

  const formatStatus = (status: string) => {
    return status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "RUNNING":
        return "text-green-600 bg-green-50 border-green-200";
      case "IN_PROGRESS":
        return "text-blue-600 bg-blue-50 border-blue-200";
      case "CLONING_REPO":
      case "INSTALLING_DEPENDENCIES":
      case "STARTING_DEV_SERVER":
      case "CREATING_TUNNEL":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const handleDeleteSession = (
    id: string,
    sessionName: string,
    sessionId?: string
  ) => {
    setSessionToDelete({ id, sessionId, name: sessionName });

    setDeleteDialogOpen(true);
  };

  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return;

    try {
      setDeletingSessionId(sessionToDelete.id);

      await deleteSession({ id: sessionToDelete.id as Id<"sessions"> });

      if (sessionToDelete.sessionId) {
        await deleteSessionAction(sessionToDelete.sessionId);
      }

      setDeleteDialogOpen(false);
      setSessionToDelete(null);
    } catch (error) {
      console.error("Failed to delete session:", error);
      alert("Failed to delete session. Please try again.");
    } finally {
      setDeletingSessionId(null);
    }
  };

  const cancelDeleteSession = () => {
    setDeleteDialogOpen(false);
    setSessionToDelete(null);
  };

  if (!sessions) {
    return (
      <div className="flex flex-col h-screen bg-background border rounded-lg">
        <div className="p-6 text-muted-foreground">
          <Loader className="size-5 animate-spin mb-2" />
        </div>
      </div>
    );
  }

  const hasActiveFilters = searchTerm !== "" || statusFilter !== "";

  return (
    <div className="flex flex-col h-screen bg-background border rounded-lg mb-2">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Sessions</h1>
            <p className="text-sm text-muted-foreground">
              Manage and monitor your development sessions
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            {hasActiveFilters ? (
              <span>
                {filteredAndPaginatedData.filteredCount} of {sessions.length}{" "}
                sessions
              </span>
            ) : (
              <span>{sessions.length} total sessions</span>
            )}
          </div>
        </div>

        {/* Search and Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search by name, session ID, or status message..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchTerm && (
              <button
                onClick={() => handleSearchChange("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onValueChange={handleStatusFilterChange}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                {uniqueStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {formatStatus(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="whitespace-nowrap"
            >
              <XIcon className="w-4 h-4 mr-1" />
              Clear filters
            </Button>
          )}
        </div>

        <div className="border rounded-lg">
          <ScrollArea className="h-[calc(100vh-300px)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px] px-4">Name</TableHead>
                  <TableHead>Session ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Preview url</TableHead>
                  <TableHead className="w-[40px]">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndPaginatedData.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <div className="text-muted-foreground">
                        {hasActiveFilters ? (
                          <div>
                            <p>No sessions match your filters</p>
                            <Button
                              variant="link"
                              onClick={clearFilters}
                              className="mt-2"
                            >
                              Clear filters to see all sessions
                            </Button>
                          </div>
                        ) : (
                          "No sessions found"
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndPaginatedData.data.map((session) => (
                    <TableRow
                      key={session.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSessionClick(session.id)}
                    >
                      <TableCell className="font-medium px-4">
                        {session.name}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {session.sessionId || "N/A"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(session.status)}`}
                        >
                          {formatStatus(session.status)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {session.tunnelUrl ? (
                          <a
                            href={session.tunnelUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline truncate block max-w-[200px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {session.tunnelUrl}
                          </a>
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() =>
                            handleDeleteSession(
                              session.id,
                              session.name,
                              session.sessionId
                            )
                          }
                          disabled={deletingSessionId === session.id}
                          className="size-7"
                        >
                          {deletingSessionId === session.id ? (
                            <Loader className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
        {/* Pagination */}
        {filteredAndPaginatedData.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
              {Math.min(
                currentPage * ITEMS_PER_PAGE,
                filteredAndPaginatedData.filteredCount
              )}{" "}
              of {filteredAndPaginatedData.filteredCount}{" "}
              {hasActiveFilters ? "filtered " : ""}sessions
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPrevious}
                disabled={currentPage === 1}
              >
                Previous
              </Button>

              <div className="flex items-center space-x-1">
                {Array.from(
                  { length: filteredAndPaginatedData.totalPages },
                  (_, i) => i + 1
                ).map((page) => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => goToPage(page)}
                    className="w-8 h-8"
                  >
                    {page}
                  </Button>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={goToNext}
                disabled={currentPage === filteredAndPaginatedData.totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the session &quot;
              {sessionToDelete?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={cancelDeleteSession}
              disabled={deletingSessionId !== null}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDeleteSession}
              disabled={deletingSessionId !== null}
            >
              {deletingSessionId === sessionToDelete?.id && (
                <Loader className="w-4 h-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
