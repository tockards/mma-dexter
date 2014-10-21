from itertools import groupby
from datetime import datetime
from dateutil.parser import parse

from dexter.models import db, Document, DocumentSource, Person, Utterance, Entity

from sqlalchemy.sql import func, distinct, or_, desc
from sqlalchemy.orm import joinedload

class AnalyzedSource(object):
    pass

class SourceAnalyzer(object):
    """
    Helper that runs analyses on document sources.
    """
    def __init__(self, doc_ids=None, start_date=None, end_date=None):
        self.doc_ids = doc_ids
        self.start_date = start_date
        self.end_date = end_date
        self._calculate_date_range()
        self._fetch_doc_ids()

        self.top_people = None
        # max results for most analyses
        self.row_limit = 20


    def analyze(self):
        self._analyze_top_people()


    def _analyze_top_people(self):
        """
        Calculate top people for these documents, storing the results in
        `top_sources`.
        Top people are those people who were sources the most over a period.
        """
        sources = []
        query = db.session.query(
                DocumentSource.person_id,
                func.count(DocumentSource.person_id).label('count')
                )\
                .filter(
                        DocumentSource.doc_id.in_(self.doc_ids),
                        DocumentSource.person_id != None)\
                .group_by(DocumentSource.person_id)\
                .order_by(desc('count'))\
                .limit(self.row_limit)

        rows = query.all()

        people = self._lookup_people([r[0] for r in rows])
        utterance_count = self._count_utterances(people.keys())
        source_counts = self.source_frequencies(people.keys())

        for row in (r._asdict() for r in query.all()):
            src = AnalyzedSource()
            src.person = people[row['person_id']]
            src.count = row['count']
            src.utterance_count = utterance_count.get(src.person.id, 0)
            src.source_counts = source_counts[src.person.id]
            sources.append(src)

        self.top_people = sources


    def _lookup_people(self, ids):
        query = Person.query\
                .options(joinedload(Person.affiliation))\
                .filter(Person.id.in_(ids))

        return dict([p.id, p] for p in query.all())


    def _count_utterances(self, ids):
        """
        Return dict from person ID to number of utterances they had in
        these documents.
        """
        rows = db.session.query(
                Person.id,
                func.count(1).label('count')
                )\
                .join(Entity, Entity.person_id == Person.id)\
                .join(Utterance, Utterance.entity_id == Entity.id)\
                .filter(Utterance.doc_id.in_(self.doc_ids))\
                .filter(Person.id.in_(ids))\
                .group_by(Person.id)\
                .all()

        return dict((p[0], p[1]) for p in rows)


    def source_frequencies(self, ids):
        """
        Return dict from person ID to a list of how frequently each
        source was used per day, over the period.
        """
        rows = db.session.query(
                    DocumentSource.person_id,
                    func.date_format(Document.published_at, '%Y-%m-%d').label('date'),
                    func.count(1).label('count')
                )\
                .join(Document, DocumentSource.doc_id == Document.id)\
                .filter(DocumentSource.person_id.in_(ids))\
                .filter(DocumentSource.doc_id.in_(self.doc_ids))\
                .group_by(DocumentSource.person_id, 'date')\
                .order_by(DocumentSource.person_id, Document.published_at)\
                .all()

        freqs = {}
        for person_id, group in groupby(rows, lambda r: r[0]):
            freqs[person_id] = [0] * (self.days+1)

            # set day buckets based on date
            for row in group:
                d, n = parse(row[1]).date(), row[2]
                day = (d - self.start_date).days
                freqs[person_id][day] = n

        return freqs

    def _calculate_date_range(self):
        """
        The date range is the range of publication dates for the given
        documents.
        """
        if not self.start_date or not self.end_date:
            if self.doc_ids is None:
                raise ValueError("Need either doc_ids, or both start_date and end_date")

            row = db.session.query(
                    func.min(Document.published_at),
                    func.max(Document.published_at))\
                    .filter(Document.id.in_(self.doc_ids))\
                    .first()

            if row and row[0]:
                self.start_date = row[0].date()
                self.end_date = row[1].date()
            else:
                self.start_date = self.end_date = datetime.utcnow()

        self.days = max((self.end_date - self.start_date).days, 1)


    def _fetch_doc_ids(self):
        if self.doc_ids is None:
            rows = db.session.query(Document.id)\
                    .filter(Document.published_at >= self.start_date.strftime('%Y-%m-%d 00:00:00'))\
                    .filter(Document.published_at <= self.end_date.strftime('%Y-%m-%d 23:59:59'))\
                    .all()
            self.doc_ids = [r[0] for r in rows]
