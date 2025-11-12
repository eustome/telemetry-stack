import os
from pathlib import Path
from typing import Any, Iterable, Optional
import aiosqlite


def get_db_path() -> Path:
    env_path = os.getenv("DB_PATH")
    return Path(env_path) if env_path else Path(__file__).with_name("telemetry.db")

# инициализация базы
async def init_db() -> None:
    async with aiosqlite.connect(get_db_path()) as conn:
        await conn.execute(
            """
            create table if not exists events (
                id integer primary key autoincrement,
                agent_id text not null,
                ts text not null,
                platform text not null,
                event_type text not null,
                cpu real,
                mem_free integer,
                pid integer,
                proc_name text,
                rss integer,
                ingested_at text not null default (datetime('now'))
            )
            """
        )
        await conn.commit()
        try:
            await conn.execute("alter table events add column rss integer")
            await conn.commit()
        except aiosqlite.OperationalError:
            pass

# запись событий
async def insert_events(rows: Iterable[tuple[Any, ...]]) -> list[dict[str, Any]]:
    async with aiosqlite.connect(get_db_path()) as conn:
        conn.row_factory = aiosqlite.Row
        inserted: list[dict[str, Any]] = []
        for row in rows:
            cursor = await conn.execute(
                """
                insert into events (
                    agent_id,
                    ts,
                    platform,
                    event_type,
                    cpu,
                    mem_free,
                    pid,
                    proc_name,
                    rss
                )
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                row,
            )
            event_id = cursor.lastrowid
            detail_cursor = await conn.execute(
                """
                select
                    id,
                    agent_id,
                    ts,
                    platform,
                    event_type,
                    cpu,
                    mem_free,
                    pid,
                    proc_name,
                    rss,
                    ingested_at
                from events
                where id = ?
                """,
                (event_id,),
            )
            detail = await detail_cursor.fetchone()
            if detail:
                inserted.append(dict(detail))
        await conn.commit()
        return inserted

# выборка
async def fetch_events(agent_id: Optional[str], limit: int) -> list[dict[str, Any]]:
    async with aiosqlite.connect(get_db_path()) as conn:
        conn.row_factory = aiosqlite.Row
        if agent_id:
            cursor = await conn.execute(
                """
                select
                    id,
                    agent_id,
                    ts,
                    platform,
                    event_type,
                    cpu,
                    mem_free,
                    pid,
                    proc_name,
                    rss,
                    ingested_at
                from events
                where agent_id = ?
                order by ingested_at desc
                limit ?
                """,
                (agent_id, limit),
            )
        else:
            cursor = await conn.execute(
                """
                select
                    id,
                    agent_id,
                    ts,
                    platform,
                    event_type,
                    cpu,
                    mem_free,
                    pid,
                    proc_name,
                    rss,
                    ingested_at
                from events
                order by ingested_at desc
                limit ?
                """,
                (limit,),
            )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

# очистка
async def remove_events(agent_id: Optional[str]) -> int:
    async with aiosqlite.connect(get_db_path()) as conn:
        if agent_id:
            cursor = await conn.execute(
                "delete from events where agent_id = ?",
                (agent_id,),
            )
        else:
            cursor = await conn.execute("delete from events")
        await conn.commit()
        return cursor.rowcount or 0

