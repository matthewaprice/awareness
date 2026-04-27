import { getPublicStatistics } from "@/actions/aggregation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Public-facing aggregated statistics page.
 *
 * Displays de-identified, aggregated symptom statistics.
 * No authentication required (public route under (public) group).
 * No PII is rendered — only counts, percentages, and statistical summaries.
 *
 * Requirements: 3.3, 6.2
 */
export default async function StatisticsPage() {
  const stats = await getPublicStatistics();

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Symptom Statistics</h1>
      <p className="text-muted-foreground mb-8">
        Aggregated, de-identified data from patient surveys. No personal
        information is displayed.
      </p>

      {/* Overview cards */}
      <section
        aria-label="Overview statistics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8"
      >
        <Card>
          <CardHeader>
            <CardDescription>Total Responses</CardDescription>
            <CardTitle className="text-4xl">{stats.totalResponses}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Survey Questions</CardDescription>
            <CardTitle className="text-4xl">{stats.totalQuestions}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Unique Symptoms Tracked</CardDescription>
            <CardTitle className="text-4xl">
              {stats.topSymptoms.length}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      {/* Most common symptoms */}
      {stats.topSymptoms.length > 0 && (
        <section aria-label="Most common symptoms" className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Most Common Symptoms</CardTitle>
              <CardDescription>
                Questions with the highest number of responses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3" role="list">
                {stats.topSymptoms.map((symptom, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between border-b pb-2 last:border-b-0"
                  >
                    <span className="text-sm">{symptom.questionText}</span>
                    <span className="text-sm font-medium tabular-nums">
                      {symptom.responseCount} responses
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Severity distribution */}
      {stats.severityDistribution.length > 0 && (
        <section aria-label="Severity distribution" className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Answer Distribution</CardTitle>
              <CardDescription>
                Distribution of scale and choice-based answers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3" role="list">
                {stats.severityDistribution.map((item, i) => (
                  <li key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{item.label}</span>
                      <span className="font-medium tabular-nums">
                        {item.count} ({item.percentage}%)
                      </span>
                    </div>
                    <div
                      className="h-2 rounded-full bg-muted overflow-hidden"
                      role="progressbar"
                      aria-valuenow={item.percentage}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${item.label}: ${item.percentage}%`}
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Responses over time */}
      {stats.responsesByMonth.length > 0 && (
        <section aria-label="Responses over time" className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Responses Over Time</CardTitle>
              <CardDescription>Monthly survey submission counts</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2" role="list">
                {stats.responsesByMonth.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{item.month}</span>
                    <span className="font-medium tabular-nums">
                      {item.count} responses
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {stats.totalResponses === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No survey data is available yet. Statistics will appear here once
              patients begin submitting surveys.
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
